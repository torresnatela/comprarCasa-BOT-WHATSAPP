import { randomUUID } from "node:crypto";
import { AppError } from "../../http/errors";

export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

export type EvolutionConfig = {
  baseUrl: string;
  /** Token da instância (recomendado) ou chave global da Evolution API. */
  apiKey: string;
  instance: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type RegisteredWebhook = {
  url: string;
  enabled: boolean;
  events: string[];
};

const unavailable = () =>
  new AppError(
    502,
    "WHATSAPP_UNAVAILABLE",
    "Não foi possível falar com o WhatsApp agora. Tente novamente.",
  );

function errorFor(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(
      502,
      "WHATSAPP_AUTH",
      "A Evolution API recusou a chave configurada.",
    );
  }
  if (status === 404) {
    return new AppError(
      502,
      "WHATSAPP_INSTANCE",
      "A instância configurada não foi encontrada na Evolution API.",
    );
  }
  if (status === 400) {
    return new AppError(
      422,
      "WHATSAPP_REJECTED",
      "O WhatsApp não aceitou o envio para este contato.",
    );
  }
  return unavailable();
}

/** Cliente da Evolution API v2 para uma única instância. */
export function createEvolutionClient({
  baseUrl,
  apiKey,
  instance,
  fetch: fetchImpl = fetch,
  timeoutMs = 15_000,
}: EvolutionConfig) {
  const root = baseUrl.replace(/\/+$/, "");
  const instancePath = encodeURIComponent(instance);

  async function request(method: "GET" | "POST", path: string, body?: unknown) {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}/${instancePath}`, {
        method,
        headers: {
          apikey: apiKey,
          ...(body !== undefined && { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw unavailable();
    }
    if (!response.ok) throw errorFor(response.status);
    return response.json().catch(() => {
      throw unavailable();
    }) as Promise<unknown>;
  }

  return {
    instance,

    /**
     * `to` é o JID guardado no lead; assim a Evolution não reformata o número.
     * Com `typingMs`, o contacto vê "a escrever…" durante esse tempo antes de
     * a mensagem chegar (a chamada só termina depois do envio).
     */
    async sendText(
      to: string,
      text: string,
      { typingMs }: { typingMs?: number } = {},
    ): Promise<{ externalId: string; sentAt: Date }> {
      const data = (await request("POST", "/message/sendText", {
        number: to,
        text,
        ...(typingMs && typingMs > 0 && { delay: Math.round(typingMs) }),
      })) as { key?: { id?: unknown }; messageTimestamp?: unknown } | null;

      const id = data?.key?.id;
      const timestamp = Number(data?.messageTimestamp);
      return {
        // A mensagem já saiu; sem id externo, gera um para não perdê-la.
        externalId: typeof id === "string" && id ? id : `portal-${randomUUID()}`,
        sentAt:
          Number.isFinite(timestamp) && timestamp > 0
            ? new Date(timestamp * 1000)
            : new Date(),
      };
    },

    /** Marca mensagens recebidas como lidas (os dois vistos azuis no WhatsApp do contacto). */
    async markAsRead(messages: { remoteJid: string; id: string }[]): Promise<void> {
      if (messages.length === 0) return;
      await request("POST", "/chat/markMessageAsRead", {
        readMessages: messages.map(({ remoteJid, id }) => ({ remoteJid, id, fromMe: false })),
      });
    },

    /**
     * Mostra "a escrever…" para o contacto. A Evolution só responde depois de
     * `durationMs`, quando volta ao estado normal.
     */
    async showTyping(to: string, durationMs: number): Promise<void> {
      await request("POST", "/chat/sendPresence", {
        number: to,
        presence: "composing",
        delay: Math.round(durationMs),
      });
    },

    /** `open` significa conectado ao WhatsApp. */
    async getConnectionState(): Promise<string> {
      const data = (await request("GET", "/instance/connectionState")) as {
        instance?: { state?: unknown };
      } | null;
      const state = data?.instance?.state;
      return typeof state === "string" ? state : "unknown";
    },

    async findWebhook(): Promise<RegisteredWebhook | null> {
      const data = (await request("GET", "/webhook/find")) as {
        url?: unknown;
        enabled?: unknown;
        events?: unknown;
      } | null;
      if (!data || typeof data.url !== "string") return null;
      return {
        url: data.url,
        enabled: data.enabled === true,
        events: Array.isArray(data.events) ? data.events.map(String) : [],
      };
    },

    /** Substitui o webhook da instância, se houver outro. */
    async setWebhook({ url, secret }: { url: string; secret: string }): Promise<void> {
      await request("POST", "/webhook/set", {
        webhook: {
          enabled: true,
          url,
          headers: { [WEBHOOK_SECRET_HEADER]: secret },
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT"],
        },
      });
    },
  };
}

export type EvolutionClient = ReturnType<typeof createEvolutionClient>;
