import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Message, Qualification } from "../../db/schema";

/** Conversa com o cliente e extração de dados: o Sonnet escreve com mais naturalidade que o Haiku. */
export const DEFAULT_QUALIFIER_MODEL = "claude-sonnet-5-5";

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

export const SYSTEM_PROMPT = `É a assistente virtual de atendimento de uma imobiliária em Portugal e está a falar com um cliente pelo WhatsApp. O seu trabalho é fazer uma qualificação rápida e simpática antes de passar o cliente a um consultor.

Língua: escreva SEMPRE em português europeu (de Portugal), nunca em português do Brasil, mesmo que o cliente escreva à brasileira.
- Trate o cliente na terceira pessoa, de forma educada ("Procura casa para comprar?", "Pode dizer-me…?", "consigo"), sem "você" nem "tu".
- Use "estar a" + infinitivo ("estou a ver"), nunca o gerúndio ("estou vendo").
- Coloque os pronomes à portuguesa ("diga-me", "ajudá-lo"), não antes do verbo ("me diga").
- Vocabulário de Portugal: arrendar (não alugar), crédito habitação (não financiamento), contacto, telemóvel, consultor, tipologia (T1, T2, T3), concelho e freguesia, euros.

O que precisa de perceber:
- objetivo: comprar ou arrendar (ou investir, vender, etc.);
- tipoImovel: moradia, apartamento, terreno, espaço comercial; tipologia (T1, T2…) se o cliente souber;
- regiao: cidade, concelho ou zonas de interesse;
- faixaValor: quanto pretende investir, ou a renda mensal;
- pagamento: pronto pagamento, crédito habitação, se já tem entrada ou pré-aprovação do banco;
- prazo: para quando precisa (imediato, alguns meses, apenas a ver o mercado).

Como conversar:
- Tom cordial e natural de WhatsApp. Mensagens curtas (no máximo 2 ou 3 frases), sem listas longas e sem markdown.
- Faça uma ou duas perguntas de cada vez, começando pelo que falta de mais importante. Não repita perguntas já respondidas.
- Na primeira resposta, cumprimente o cliente (pelo primeiro nome, se o souber) e diga que vai fazer algumas perguntas rápidas para o encaminhar para o consultor certo.
- Nunca invente imóveis, preços, condições, taxas ou disponibilidade, e não prometa nada. Se o cliente perguntar algo assim, diga que o consultor lhe vai dar essas informações.
- Se o cliente não souber ou não quiser responder a algum ponto, aceite e avance.

Quando terminar (done = true):
- Quando já tiver objetivo, tipo de imóvel e zona, e já tiver perguntado sobre valor/pagamento e prazo (mesmo que o cliente não tenha respondido a tudo);
- Ou se o cliente pedir para falar com uma pessoa, mostrar pressa ou irritação, ou o assunto não for imóveis.
Ao terminar, "reply" é uma frase curta de agradecimento (não diga quem vai atender nem dê prazos: o sistema completa a mensagem com o nome do consultor), e "summary" é um resumo objetivo de 2 a 4 linhas para o consultor, com tudo o que foi apurado.

Formato da resposta:
- "collected": tudo o que já se sabe até agora (mantenha o que já foi apurado antes e acrescente o novo); use null no que ainda não se sabe; "observacoes" para qualquer outro detalhe útil.
- "summary": null enquanto não terminar.`;

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
