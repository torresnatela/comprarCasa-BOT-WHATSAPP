import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Message, Qualification } from "../../db/schema";

/** Barato e rápido: a tarefa é conversa curta + extração de dados. */
export const DEFAULT_QUALIFIER_MODEL = "claude-haiku-5-5";

export type QualifierInput = {
  leadName: string | null;
  /** Conversa até agora, em ordem cronológica. */
  history: Pick<Message, "direction" | "text">[];
  /** O que já foi apurado nos turnos anteriores. */
  collected: Qualification;
};

export type QualifierTurn = {
  /** Próxima mensagem para o lead. Vazia quando a IA encerra sem ter o que dizer. */
  reply: string;
  collected: Qualification;
  /** A IA já tem o suficiente (ou o lead pediu uma pessoa): hora de passar ao vendedor. */
  done: boolean;
  /** Resumo para o vendedor; vem preenchido quando `done`. */
  summary: string | null;
};

export interface LeadQualifier {
  nextTurn(input: QualifierInput): Promise<QualifierTurn>;
}

/** A IA não conseguiu responder (erro da API, recusa ou resposta fora do formato). */
export class QualifierError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "QualifierError";
  }
}

const field = z.string().nullable();

const TurnSchema = z.object({
  reply: z.string(),
  collected: z.object({
    objetivo: field,
    tipoImovel: field,
    regiao: field,
    faixaValor: field,
    pagamento: field,
    prazo: field,
    observacoes: field,
  }),
  done: z.boolean(),
  summary: field,
});

export const SYSTEM_PROMPT = `Você é a assistente virtual de atendimento de uma imobiliária, conversando com um cliente pelo WhatsApp. Seu trabalho é fazer uma qualificação rápida e simpática antes de passar o cliente para um corretor.

O que você precisa entender:
- objetivo: comprar ou alugar (ou investir, vender etc.);
- tipoImovel: casa, apartamento, terreno, comercial; número de quartos se ele souber;
- regiao: cidade e bairros de interesse;
- faixaValor: quanto pretende investir ou pagar por mês;
- pagamento: à vista, financiamento, FGTS, se já tem entrada;
- prazo: para quando precisa (imediato, alguns meses, só pesquisando).

Como conversar:
- Português do Brasil, tom cordial e natural de WhatsApp. Mensagens curtas (no máximo 2 ou 3 frases), sem listas longas e sem markdown.
- Faça uma ou duas perguntas por vez, começando pelo que falta de mais importante. Não repita perguntas já respondidas.
- Na primeira resposta, cumprimente o cliente (pelo primeiro nome, se souber) e diga que vai fazer algumas perguntas rápidas para direcioná-lo ao corretor certo.
- Nunca invente imóveis, preços, condições, taxas ou disponibilidade, e não prometa nada. Se o cliente perguntar algo assim, diga que o corretor vai trazer essas informações.
- Se o cliente não souber ou não quiser responder algum ponto, aceite e siga em frente.

Quando encerrar (done = true):
- Quando tiver objetivo, tipo de imóvel e região, e já tiver perguntado sobre valor/pagamento e prazo (mesmo que ele não tenha respondido tudo);
- Ou se o cliente pedir para falar com uma pessoa, demonstrar pressa ou irritação, ou o assunto não for imóveis.
Ao encerrar, "reply" é uma frase curta de agradecimento (não diga quem vai atender nem dê prazos: o sistema completa a mensagem com o nome do corretor), e "summary" é um resumo objetivo de 2 a 4 linhas para o corretor, com tudo o que foi apurado.

Formato da resposta:
- "collected": tudo o que já se sabe até agora (mantenha o que já foi apurado antes e acrescente o novo); use null no que ainda não se sabe; "observacoes" para qualquer outro detalhe útil.
- "summary": null enquanto não encerrar.`;

type Role = "user" | "assistant";

/**
 * Converte a conversa no formato da API: o que o lead mandou é `user`, o que
 * a imobiliária mandou é `assistant`. Mensagens seguidas do mesmo lado viram
 * uma só, e a conversa sempre começa e termina com o lead.
 */
export function toApiMessages(
  history: QualifierInput["history"],
): Anthropic.MessageParam[] {
  const turns: { role: Role; texts: string[] }[] = [];
  for (const message of history) {
    const role: Role = message.direction === "RECEBIDA" ? "user" : "assistant";
    const text = message.text.trim();
    if (!text) continue;
    const last = turns.at(-1);
    if (last?.role === role) last.texts.push(text);
    else turns.push({ role, texts: [text] });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  while (turns.at(-1)?.role === "assistant") turns.pop();
  return turns.map(({ role, texts }) => ({ role, content: texts.join("\n") }));
}

function contextMessage({ leadName, collected }: QualifierInput): string {
  const known = Object.entries(collected).filter(([, value]) => value);
  return [
    `Nome do cliente no WhatsApp: ${leadName ?? "desconhecido"}.`,
    known.length
      ? `Já apurado: ${JSON.stringify(Object.fromEntries(known))}.`
      : "Nada apurado ainda.",
  ].join("\n");
}

type Deps = {
  client: Anthropic;
  model?: string;
};

export function createLeadQualifier({
  client,
  model = DEFAULT_QUALIFIER_MODEL,
}: Deps): LeadQualifier {
  return {
    async nextTurn(input) {
      const messages = toApiMessages(input.history);
      if (messages.length === 0) {
        throw new QualifierError("Conversa sem mensagens do lead.");
      }
      let response;
      try {
        response = await client.messages.parse({
          model,
          max_tokens: 2048,
          // Prompt fixo primeiro, contexto do lead depois: o começo nunca muda.
          system: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "text", text: contextMessage(input) },
          ],
          output_config: { effort: "low", format: zodOutputFormat(TurnSchema) },
          messages,
        });
      } catch (error) {
        throw new QualifierError("Falha ao chamar a API da Anthropic.", { cause: error });
      }

      if (response.stop_reason === "refusal") {
        throw new QualifierError("A IA recusou responder.");
      }
      const turn = response.parsed_output;
      if (!turn) {
        throw new QualifierError(`Resposta da IA fora do formato (${response.stop_reason}).`);
      }
      return {
        reply: turn.reply.trim(),
        collected: turn.collected,
        done: turn.done,
        summary: turn.summary?.trim() || null,
      };
    },
  };
}
