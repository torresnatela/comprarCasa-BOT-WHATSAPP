import { AppError } from "../http/errors";
import type { EvolutionClient } from "../integrations/evolution/client";
import { whatsappNotConfigured } from "./conversation.service";

export const WEBHOOK_PATH = "/api/webhooks/evolution";

type Deps = {
  evolution: EvolutionClient | null;
  webhookSecret: string | null;
  /** Variáveis de ambiente que faltam. */
  missing: string[];
  /** URL pública do portal; sem ela, usa a origem da requisição. */
  appUrl?: string;
};

export type WhatsappStatus =
  | { configured: false; missing: string[] }
  | {
      configured: true;
      instance: string;
      connected: boolean;
      /** Endereço que este portal espera ver registrado na Evolution. */
      webhookUrl: string;
      webhook: { url: string; enabled: boolean; pointsHere: boolean } | null;
    };

/** A Evolution roda em outro servidor: precisa de um endereço público e HTTPS. */
function isReachable(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  return protocol === "https:" && !local;
}

export function createWhatsappService({
  evolution,
  webhookSecret,
  missing,
  appUrl,
}: Deps) {
  const webhookUrlFor = (origin: string) =>
    `${(appUrl || origin).replace(/\/+$/, "")}${WEBHOOK_PATH}`;

  async function status(origin: string): Promise<WhatsappStatus> {
    if (!evolution || !webhookSecret) return { configured: false, missing };

    const webhookUrl = webhookUrlFor(origin);
    const [state, webhook] = await Promise.all([
      evolution.getConnectionState(),
      evolution.findWebhook(),
    ]);
    return {
      configured: true,
      instance: evolution.instance,
      connected: state === "open",
      webhookUrl,
      webhook: webhook && {
        url: webhook.url,
        enabled: webhook.enabled,
        pointsHere: webhook.url === webhookUrl,
      },
    };
  }

  return {
    status,

    /** Aponta o webhook da instância para este portal (substitui o que houver). */
    async registerWebhook(origin: string): Promise<WhatsappStatus> {
      if (!evolution || !webhookSecret) throw whatsappNotConfigured();

      const url = webhookUrlFor(origin);
      if (!isReachable(url)) {
        throw new AppError(
          409,
          "WEBHOOK_URL_NOT_PUBLIC",
          "O webhook precisa de um endereço público com HTTPS. Defina APP_URL com a URL do portal em produção.",
        );
      }
      await evolution.setWebhook({ url, secret: webhookSecret });
      return status(origin);
    },
  };
}

export type WhatsappService = ReturnType<typeof createWhatsappService>;
