import "server-only";
import { createControllers } from "./controllers";
import { getDb } from "./db/client";
import { readEvolutionConfig } from "./integrations/evolution/config";
import { createServices } from "./services";
import { createPasswordHasher } from "./services/password";

function build() {
  const whatsapp = readEvolutionConfig(process.env);
  const appUrl = process.env.APP_URL;
  const services = createServices({
    db: getDb(),
    hasher: createPasswordHasher(),
    whatsapp,
    appUrl,
  });
  const controllers = createControllers({
    services,
    secureCookies: process.env.NODE_ENV === "production",
    whatsapp,
    appUrl,
  });
  return { services, controllers };
}

let container: ReturnType<typeof build> | undefined;

/**
 * Ponto único onde a aplicação real é montada (banco + services + controllers).
 * É criado só no primeiro uso, para o build não exigir DATABASE_URL.
 */
export function getContainer() {
  container ??= build();
  return container;
}

export const controllers = () => getContainer().controllers;
export const services = () => getContainer().services;
