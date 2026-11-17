import { createControllers } from "@/server/controllers";
import type { Database } from "@/server/db/types";
import { createServices } from "@/server/services";
import { fastHasher } from "./hasher";

/** Monta services e controllers reais sobre o banco de teste. */
export function createTestApp(db: Database, appUrl?: string) {
  const services = createServices({ db, hasher: fastHasher });
  const controllers = createControllers({
    services,
    secureCookies: false,
    appUrl,
  });
  return { services, controllers };
}

/** Segundo argumento dos route handlers do Next (params é uma Promise). */
export function routeParams<P>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}
