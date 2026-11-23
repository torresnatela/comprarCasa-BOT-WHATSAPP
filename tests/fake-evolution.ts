import type {
  EvolutionClient,
  RegisteredWebhook,
} from "@/server/integrations/evolution/client";
import { INSTANCE } from "./evolution-fixtures";

/** Evolution de mentira: registra o que foi pedido e pode simular falhas. */
export function createFakeEvolution() {
  const state = {
    sent: [] as { to: string; text: string }[],
    /** Tempo de "a escrever" pedido em cada envio, na mesma ordem de `sent`. */
    typingMs: [] as (number | undefined)[],
    read: [] as { remoteJid: string; id: string }[],
    typing: [] as { to: string; durationMs: number }[],
    webhook: null as RegisteredWebhook | null,
    registered: [] as { url: string; secret: string }[],
    connection: "open",
    failWith: null as Error | null,
    /** Faz falhar só os envios para este destinatário. */
    failSendTo: null as string | null,
    /** Faz falhar só "marcar como lida" e "a escrever". */
    failReadAndTyping: false,
    nextId: 1,
  };

  const guard = () => {
    if (state.failWith) throw state.failWith;
  };

  const client: EvolutionClient = {
    instance: INSTANCE,
    async sendText(to, text, { typingMs } = {}) {
      guard();
      if (state.failSendTo === to) throw new Error(`Envio para ${to} falhou`);
      state.sent.push({ to, text });
      state.typingMs.push(typingMs);
      return {
        externalId: `SENT-${state.nextId++}`,
        sentAt: new Date("2026-11-17T13:00:00Z"),
      };
    },
    async markAsRead(messages) {
      guard();
      if (state.failReadAndTyping) throw new Error("Evolution recusou a leitura");
      state.read.push(...messages);
    },
    async showTyping(to, durationMs) {
      guard();
      if (state.failReadAndTyping) throw new Error("Evolution recusou a presença");
      state.typing.push({ to, durationMs });
    },
    async getConnectionState() {
      guard();
      return state.connection;
    },
    async findWebhook() {
      guard();
      return state.webhook;
    },
    async setWebhook({ url, secret }) {
      guard();
      state.registered.push({ url, secret });
      state.webhook = { url, enabled: true, events: ["MESSAGES_UPSERT"] };
    },
  };

  return { client, state };
}
