import { isAutomationActive } from "../../lib/funnel";
import type { Lead, LeadTask, Message, User } from "../db/schema";
import type { Database } from "../db/types";
import { AppError, NotFoundError } from "../http/errors";
import type { EvolutionClient } from "../integrations/evolution/client";
import type { IncomingMessage } from "../integrations/evolution/webhook-payload";
import { type LeadWithNextTask, leadModel } from "../models/lead.model";
import { messageModel } from "../models/message.model";
import { taskModel } from "../models/task.model";

type Deps = {
  db: Database;
  /** Nulo quando a Evolution API ainda não foi configurada. */
  evolution: EvolutionClient | null;
};

export type ReceiveResult =
  | {
      status: "stored";
      lead: Lead;
      message: Message;
      isNewLead: boolean;
      /** Se a IA deve responder (etapa Qualificação e não pausada). */
      automationActive: boolean;
    }
  | { status: "duplicate" }
  | { status: "ignored" };

export const whatsappNotConfigured = () =>
  new AppError(
    503,
    "WHATSAPP_NOT_CONFIGURED",
    "A integração com o WhatsApp ainda não foi configurada.",
  );

export function createConversationService({ db, evolution }: Deps) {
  return {
    /**
     * Entrada única de toda mensagem vinda do WhatsApp. É aqui que a
     * qualificação por IA será ligada: `isNewLead` marca o início da conversa
     * e a IA só deve responder quando `automationActive` for verdadeiro.
     * Mensagem nova nunca muda a etapa do funil.
     */
    receive(incoming: IncomingMessage): Promise<ReceiveResult> {
      return db.transaction(async (tx) => {
        const leads = leadModel(tx);

        // Conversa iniciada pela imobiliária com um desconhecido não é lead.
        if (incoming.fromMe && !(await leads.findByJid(incoming.jid))) {
          return { status: "ignored" };
        }

        const { lead, created } = await leads.findOrCreate({
          whatsappJid: incoming.jid,
          phone: incoming.phone,
          name: incoming.pushName,
          lastMessageAt: incoming.sentAt,
          lastMessageText: incoming.text,
        });

        const message = await messageModel(tx).insertIfNew({
          leadId: lead.id,
          direction: incoming.fromMe ? "ENVIADA" : "RECEBIDA",
          type: incoming.type,
          text: incoming.text,
          externalId: incoming.externalId,
          sentAt: incoming.sentAt,
        });
        if (!message) return { status: "duplicate" };

        const updated = await leads.recordActivity(lead.id, {
          at: incoming.sentAt,
          text: incoming.text,
          name: incoming.pushName,
          phone: incoming.phone,
        });
        const current = updated ?? lead;
        return {
          status: "stored",
          lead: current,
          message,
          isNewLead: created,
          automationActive: !incoming.fromMe && isAutomationActive(current),
        };
      });
    },

    listLeads(): Promise<LeadWithNextTask[]> {
      return leadModel(db).list();
    },

    async getConversation(
      leadId: string,
    ): Promise<{ lead: Lead; messages: Message[]; tasks: LeadTask[] }> {
      const lead = await leadModel(db).findById(leadId);
      if (!lead) throw new NotFoundError("LEAD_NOT_FOUND", "Lead não encontrado.");
      const [messages, tasks] = await Promise.all([
        messageModel(db).listByLead(leadId),
        taskModel(db).listByLead(leadId),
      ]);
      return { lead, messages, tasks };
    },

    /** Responde pelo WhatsApp. Só grava a mensagem depois que o envio dá certo. */
    async reply(leadId: string, text: string, actor: User): Promise<Message> {
      if (!evolution) throw whatsappNotConfigured();
      const lead = await leadModel(db).findById(leadId);
      if (!lead) throw new NotFoundError("LEAD_NOT_FOUND", "Lead não encontrado.");

      const sent = await evolution.sendText(lead.whatsappJid, text);

      return db.transaction(async (tx) => {
        const messages = messageModel(tx);
        const stored = await messages.insertIfNew({
          leadId: lead.id,
          direction: "ENVIADA",
          type: "TEXTO",
          text,
          externalId: sent.externalId,
          sentBy: actor.id,
          sentAt: sent.sentAt,
        });
        // O webhook pode ter entregue o eco desta mesma mensagem primeiro.
        const message = stored ?? (await messages.findByExternalId(sent.externalId));
        if (!message) throw new Error("Mensagem enviada não pôde ser gravada.");

        if (stored) {
          await leadModel(tx).recordActivity(lead.id, { at: sent.sentAt, text });
        }
        return message;
      });
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
