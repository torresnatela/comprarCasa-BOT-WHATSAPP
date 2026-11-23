import { createHash, timingSafeEqual } from "node:crypto";
import { AppError, UnauthorizedError } from "../http/errors";
import { handle, json } from "../http/respond";
import { WEBHOOK_SECRET_HEADER } from "../integrations/evolution/client";
import { parseEvolutionEvent } from "../integrations/evolution/webhook-payload";
import {
  type ConversationService,
  whatsappNotConfigured,
} from "../services/conversation.service";
import type { QualificationService } from "../services/qualification.service";

/** Agenda trabalho para depois da resposta (em produção, `after` do Next). */
export type Defer = (task: () => Promise<unknown>) => void;

type Deps = {
  conversations: ConversationService;
  qualification: QualificationService;
  defer: Defer;
  webhookSecret: string | null;
  /** Só eventos desta instância são aceitos. */
  instance: string | null;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Comparação em tempo constante, para o segredo não vazar pelo tempo de resposta. */
function sameSecret(received: string | null, expected: string): boolean {
  return received !== null && timingSafeEqual(digest(received), digest(expected));
}

/**
 * Recebe os eventos da Evolution API.
 *
 * Responde 200 para tudo que foi entendido (inclusive o que é ignorado),
 * porque a Evolution reenvia até 10 vezes quando recebe erro. O corpo traz
 * a chave da instância, então o payload nunca é registrado nem devolvido.
 *
 * A resposta da IA de qualificação roda depois do 200, para a Evolution não
 * ficar esperando (nem reenviar) enquanto a IA pensa.
 */
export function createWebhookController({
  conversations,
  qualification,
  defer,
  webhookSecret,
  instance,
}: Deps) {
  return {
    receive: handle(async (request) => {
      if (!webhookSecret || !instance) throw whatsappNotConfigured();
      if (!sameSecret(request.headers.get(WEBHOOK_SECRET_HEADER), webhookSecret)) {
        throw new UnauthorizedError("INVALID_WEBHOOK_SECRET", "Segredo do webhook inválido.");
      }

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        throw new AppError(400, "INVALID_JSON", "Corpo da requisição inválido.");
      }

      const event = parseEvolutionEvent(payload);
      if (event.kind === "ignored" || event.instance !== instance) {
        return json({ ok: true, result: "ignored" });
      }

      const result = await conversations.receive(event.message);
      if (
        result.status === "stored" &&
        result.message.direction === "RECEBIDA" &&
        result.lead.stage === "QUALIFICANDO"
      ) {
        const { lead, message } = result;
        defer(() =>
          qualification.handleInbound(lead.id, message.id).catch((error) => {
            console.error(`[qualificação] erro inesperado no lead ${lead.id}`, error);
          }),
        );
      }
      return json({ ok: true, result: result.status });
    }),
  };
}

export type WebhookController = ReturnType<typeof createWebhookController>;
