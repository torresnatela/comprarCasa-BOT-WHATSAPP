import { createEvolutionClient, type EvolutionClient } from "./client";

const MIN_SECRET_LENGTH = 16;

type Env = Record<string, string | undefined>;

export type EvolutionConfig = {
  /** Nulo enquanto URL, chave ou instância não estiverem definidas. */
  client: EvolutionClient | null;
  instance: string | null;
  webhookSecret: string | null;
  /** Variáveis de ambiente que ainda faltam, para mostrar ao gestor. */
  missing: string[];
};

/** Lê a configuração da Evolution sem derrubar o app quando ela não existe. */
export function readEvolutionConfig(env: Env): EvolutionConfig {
  const baseUrl = env.EVOLUTION_API_URL?.trim();
  const apiKey = env.EVOLUTION_API_KEY?.trim();
  const instance = env.EVOLUTION_INSTANCE?.trim();
  const secret = env.EVOLUTION_WEBHOOK_SECRET?.trim();
  const webhookSecret = secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;

  const missing = [
    ...(baseUrl ? [] : ["EVOLUTION_API_URL"]),
    ...(apiKey ? [] : ["EVOLUTION_API_KEY"]),
    ...(instance ? [] : ["EVOLUTION_INSTANCE"]),
    ...(webhookSecret ? [] : ["EVOLUTION_WEBHOOK_SECRET"]),
  ];

  return {
    client:
      baseUrl && apiKey && instance
        ? createEvolutionClient({ baseUrl, apiKey, instance })
        : null,
    instance: instance || null,
    webhookSecret,
    missing,
  };
}
