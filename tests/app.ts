import { createControllers } from "@/server/controllers";
import type { Database } from "@/server/db/types";
import { createServices } from "@/server/services";
import { INSTANCE } from "./evolution-fixtures";
import { createFakeEvolution } from "./fake-evolution";
import { createFakeQualifier } from "./fake-qualifier";
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

  const ai = createFakeQualifier();
  const services = createServices({
    db,
    hasher: fastHasher,
    whatsapp,
    appUrl,
    qualifier: ai.qualifier,
  });
  // Em vez do `after` do Next: guarda as tarefas; só rodam quando o teste chamar `settle`.
  const deferred: (() => Promise<unknown>)[] = [];
  const controllers = createControllers({
    services,
    secureCookies: false,
    appUrl,
    whatsapp,
    defer: (task) => {
      deferred.push(task);
    },
  });
  /** Roda (e espera) o que o webhook agendou para depois da resposta. */
  const settle = () => Promise.all(deferred.splice(0).map((task) => task()));
  return { services, controllers, evolution: evolution.state, ai: ai.state, settle };
}

/** Segundo argumento dos route handlers do Next (params é uma Promise). */
export function routeParams<P>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}
