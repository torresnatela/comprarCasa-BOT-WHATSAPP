import type {
  EvolutionClient,
  RegisteredWebhook,
} from "@/server/integrations/evolution/client";
import { INSTANCE } from "./evolution-fixtures";

/** Evolution de mentira: registra o que foi pedido e pode simular falhas. */
export function createFakeEvolution() {
  const state = {
    sent: [] as { to: string; text: string }[],
    webhook: null as RegisteredWebhook | null,
    registered: [] as { url: string; secret: string }[],
    connection: "open",
    failWith: null as Error | null,
    nextId: 1,
  };

  const guard = () => {
    if (state.failWith) throw state.failWith;
  };

  const client: EvolutionClient = {
    instance: INSTANCE,
    async sendText(to, text) {
      guard();
      state.sent.push({ to, text });
      return {
        externalId: `SENT-${state.nextId++}`,
        sentAt: new Date("2026-11-17T13:00:00Z"),
      };
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
