/** Banco e credenciais usados só pelos testes de ponta a ponta. */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://comprarcasa:comprarcasa@localhost:5432/comprarcasa_e2e";

export const MANAGER = {
  name: "Gestora Teste",
  email: "gestora@e2e.test",
  password: "senha-da-gestora-e2e",
};
