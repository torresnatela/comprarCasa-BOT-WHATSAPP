/** Banco e credenciais usados só pelos testes de ponta a ponta. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://comprarcasa:comprarcasa@localhost:5432/comprarcasa_e2e";

export const MANAGER = {
  name: "Gestora Teste",
  email: "gestora@e2e.test",
  password: "senha-da-gestora-e2e",
};

/** Evolution API de mentira, iniciada pelo próprio teste. */
export const FAKE_EVOLUTION_PORT = 3199;
export const EVOLUTION = {
  url: `http://localhost:${FAKE_EVOLUTION_PORT}`,
  apiKey: "chave-da-instancia-e2e",
  instance: "Instancia E2E",
  webhookSecret: "segredo-do-webhook-e2e-0123456789",
};

/** API da Anthropic de mentira, iniciada pelo próprio teste. */
export const FAKE_ANTHROPIC_PORT = 3198;
/** Quando o lead escreve esta palavra, a IA falsa encerra a qualificação. */
export const QUALIFICATION_DONE_WORD = "Moema";

/** Vendedor criado no setup para o rodízio sempre ter alguém na fila. */
export const SELLER = {
  name: "Rui Rodizio",
  email: "rui@e2e.test",
  phone: "5511977776666",
};
