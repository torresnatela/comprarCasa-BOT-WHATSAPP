import "server-only";
import { after } from "next/server";
import { createControllers } from "./controllers";
import { getDb } from "./db/client";
import { readAnthropicConfig } from "./integrations/anthropic/config";
import { readEvolutionConfig } from "./integrations/evolution/config";
import { createServices } from "./services";
import { createPasswordHasher } from "./services/password";

/** Junta mensagens mandadas em sequência antes de a IA responder. */
const DEFAULT_QUALIFIER_DELAY_MS = 4_000;

function qualifierDelayMs(): number {
  const value = Number(process.env.QUALIFIER_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_QUALIFIER_DELAY_MS;
}

function build() {
  const whatsapp = readEvolutionConfig(process.env);
  const ai = readAnthropicConfig(process.env);
  const appUrl = process.env.APP_URL;
  const services = createServices({
    db: getDb(),
    hasher: createPasswordHasher(),
    whatsapp,
    appUrl,
    qualifier: ai.qualifier,
    qualifierDelayMs: qualifierDelayMs(),
  });
  const controllers = createControllers({
    services,
    secureCookies: process.env.NODE_ENV === "production",
    whatsapp,
    appUrl,
    defer: (task) => after(task),
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
