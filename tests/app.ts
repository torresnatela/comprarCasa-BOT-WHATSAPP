import { createControllers } from "@/server/controllers";
import type { Database } from "@/server/db/types";
import { createServices } from "@/server/services";
import { INSTANCE } from "./evolution-fixtures";
import { createFakeEvolution } from "./fake-evolution";
import { fastHasher } from "./hasher";

export const WEBHOOK_SECRET = "segredo-do-webhook-de-teste";

type Options = {
  /** `false` simula o portal sem as variáveis da Evolution. */
  whatsappConfigured?: boolean;
};

/** Monta services e controllers reais sobre o banco de teste e uma Evolution falsa. */
export function createTestApp(
  db: Database,
  appUrl?: string,
  { whatsappConfigured = true }: Options = {},
) {
  const evolution = createFakeEvolution();
  const whatsapp = whatsappConfigured
    ? {
        client: evolution.client,
        instance: INSTANCE,
        webhookSecret: WEBHOOK_SECRET,
        missing: [],
      }
    : {
        client: null,
        instance: null,
        webhookSecret: null,
        missing: ["EVOLUTION_API_URL", "EVOLUTION_WEBHOOK_SECRET"],
      };

  const services = createServices({ db, hasher: fastHasher, whatsapp, appUrl });
  const controllers = createControllers({
    services,
    secureCookies: false,
    appUrl,
    whatsapp,
  });
  return { services, controllers, evolution: evolution.state };
}

/** Segundo argumento dos route handlers do Next (params é uma Promise). */
export function routeParams<P>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}
