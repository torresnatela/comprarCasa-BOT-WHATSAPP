import { sql } from "drizzle-orm";
import type { Lead, Message, Qualification, User } from "../db/schema";
import type { Database } from "../db/types";
import type { LeadQualifier } from "../integrations/anthropic/qualifier";
import type { EvolutionClient } from "../integrations/evolution/client";
import { leadModel } from "../models/lead.model";
import { messageModel } from "../models/message.model";
import { userModel } from "../models/user.model";

/** Depois de tantas mensagens da IA, o lead vai para o vendedor de qualquer jeito. */
export const MAX_BOT_TURNS = 6;

type Deps = {
  db: Database;
  evolution: EvolutionClient | null;
  /** Nulo sem ANTHROPIC_API_KEY: o lead vai direto para o rodízio. */
  qualifier: LeadQualifier | null;
  appUrl?: string;
  now?: () => Date;
  /**
   * Espera antes de responder, para juntar mensagens mandadas em sequência
   * ("oi" + "quero comprar uma casa") numa resposta só.
   */
  delayMs?: number;
  maxBotTurns?: number;
};

/**
 * Tempo de "a escrever…" antes de cada mensagem da assistente: proporcional
 * ao tamanho do texto, como uma pessoa a escrever, entre 2 e 7 segundos.
 */
export function typingTime(text: string): number {
  return Math.min(7_000, Math.max(2_000, 1_000 + text.length * 40));
}

/** "A escrever…" enquanto a IA pensa na resposta. */
const THINKING_TYPING_MS = 5_000;

/** Mensagens do lead que chegaram depois da última mensagem da imobiliária. */
function unansweredInbound(history: Message[]): Message[] {
  const unanswered: Message[] = [];
  for (let i = history.length - 1; i >= 0 && history[i].direction === "RECEBIDA"; i--) {
    unanswered.unshift(history[i]);
  }
  return unanswered;
}

export type QualificationOutcome =
  | "skipped"
  | "replied"
  | "handed_off"
  | "failed";

const LABELS: Record<keyof Qualification, string> = {
  objetivo: "Objetivo",
  tipoImovel: "Imóvel",
  regiao: "Região",
  faixaValor: "Valor",
  pagamento: "Pagamento",
  prazo: "Prazo",
  observacoes: "Obs.",
};

/** Resumo montado a partir dos campos, quando a IA não chegou a escrever um. */
export function summarize(qualification: Qualification): string {
  const lines = (Object.keys(LABELS) as (keyof Qualification)[])
    .filter((key) => qualification[key])
    .map((key) => `${LABELS[key]}: ${qualification[key]}`);
  return lines.length ? lines.join("\n") : "Lead não respondeu à qualificação.";
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Mensagem final ao lead, em português de Portugal. */
export function handoffText(seller: Pick<User, "name"> | null, closing = ""): string {
  const next = seller
    ? `${firstName(seller.name)} vai entrar em contacto consigo e ajudar no que precisar.`
    : "Um dos nossos consultores vai entrar em contacto consigo brevemente.";
  return [closing.trim(), next].filter(Boolean).join(" ");
}

function sellerNotice(lead: Lead, summary: string, appUrl?: string): string {
  return [
    "Novo lead para si pelo rodízio!",
    `Nome: ${lead.name ?? "não indicado"}`,
    `WhatsApp: ${lead.phone ? `+${lead.phone}` : lead.whatsappJid}`,
    "",
    summary,
    ...(appUrl ? ["", `Conversa no portal: ${appUrl.replace(/\/$/, "")}/leads/${lead.id}`] : []),
  ].join("\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createQualificationService({
  db,
  evolution,
  qualifier,
  appUrl,
  now = () => new Date(),
  delayMs = 0,
  maxBotTurns = MAX_BOT_TURNS,
}: Deps) {
  /**
   * Envia ao lead, com "a escrever…" antes, e grava como mensagem da IA (o eco
   * do webhook vira duplicata).
   */
  async function sendAsBot(tx: Database, evo: EvolutionClient, lead: Lead, text: string) {
    const sent = await evo.sendText(lead.whatsappJid, text, { typingMs: typingTime(text) });
    const stored = await messageModel(tx).insertIfNew({
      leadId: lead.id,
      direction: "ENVIADA",
      type: "TEXTO",
      text,
      externalId: sent.externalId,
      sentByBot: true,
      sentAt: sent.sentAt,
    });
    if (stored) await leadModel(tx).recordActivity(lead.id, { at: sent.sentAt, text });
  }

  /**
   * Fecha a qualificação: o rodízio escolhe o vendedor, o lead recebe a
   * mensagem final e o vendedor é avisado. Falhas de envio não desfazem a
   * distribuição — o lead nunca fica parado.
   */
  async function handoff(
    tx: Database,
    evo: EvolutionClient,
    lead: Lead,
    turn: { closing?: string; collected: Qualification; summary: string | null },
  ): Promise<QualificationOutcome> {
    const at = now();
    const seller = await userModel(tx).lockNextInRotation();
    if (seller) await userModel(tx).markAssigned(seller.id, at);

    const summary = turn.summary ?? summarize(turn.collected);
    const updated = await leadModel(tx).finishQualification(lead.id, {
      qualification: turn.collected,
      summary,
      assignedTo: seller?.id ?? null,
      at,
    });

    try {
      await sendAsBot(tx, evo, updated, handoffText(seller, turn.closing));
    } catch (error) {
      console.error(`[qualificação] mensagem final ao lead ${lead.id} falhou`, error);
    }
    if (seller) {
      try {
        await evo.sendText(seller.phone, sellerNotice(updated, summary, appUrl));
      } catch (error) {
        console.error(`[qualificação] aviso ao vendedor ${seller.id} falhou`, error);
      }
    }
    return "handed_off";
  }

  return {
    handoff,

    /**
     * Responde uma mensagem recebida de um lead em qualificação. Roda depois
     * da resposta do webhook (via `after`). Mensagens do mesmo lead são
     * tratadas uma de cada vez, e só a mais recente é respondida.
     */
    async handleInbound(leadId: string, messageId: string): Promise<QualificationOutcome> {
      if (!evolution) return "skipped";
      const evo = evolution;
      if (delayMs > 0) await sleep(delayMs);

      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${leadId}, 0))`);

        const leads = leadModel(tx);
        const messages = messageModel(tx);
        const isLatest = async () => (await messages.latestInbound(leadId))?.id === messageId;

        const lead = await leads.findById(leadId);
        if (!lead || lead.stage !== "QUALIFICANDO" || !(await isLatest())) return "skipped";

        const history = await messages.listByLead(leadId);
        // Como uma pessoa: lê (vistos azuis) e começa a escrever.
        try {
          await evo.markAsRead(
            unansweredInbound(history).map((m) => ({ remoteJid: lead.whatsappJid, id: m.externalId })),
          );
        } catch (error) {
          console.error(`[qualificação] marcar como lida falhou no lead ${leadId}`, error);
        }
        // Não espera: a Evolution só responde quando o "a escrever" acaba.
        evo.showTyping(lead.whatsappJid, THINKING_TYPING_MS).catch(() => undefined);

        const collected = lead.qualification ?? {};
        if (!qualifier || (await messages.countByBot(leadId)) >= maxBotTurns) {
          return handoff(tx, evo, lead, { collected, summary: null });
        }

        let turn;
        try {
          turn = await qualifier.nextTurn({ leadName: lead.name, history, collected });
        } catch (error) {
          console.error(`[qualificação] IA falhou para o lead ${leadId}; indo para o rodízio`, error);
          return handoff(tx, evo, lead, { collected, summary: null });
        }

        // Chegou mensagem nova enquanto a IA pensava: ela responde com tudo.
        if (!(await isLatest())) return "skipped";
        // Um colaborador assumiu a conversa enquanto a IA pensava.
        const current = await leads.findById(leadId);
        if (current?.stage !== "QUALIFICANDO") return "skipped";

        if (turn.done || !turn.reply) {
          return handoff(tx, evo, lead, {
            closing: turn.reply,
            collected: turn.collected,
            summary: turn.summary,
          });
        }

        await leads.saveQualification(leadId, turn.collected);
        try {
          await sendAsBot(tx, evo, lead, turn.reply);
        } catch (error) {
          console.error(`[qualificação] envio ao lead ${leadId} falhou`, error);
          return "failed";
        }
        return "replied";
      });
    },
  };
}

export type QualificationService = ReturnType<typeof createQualificationService>;
