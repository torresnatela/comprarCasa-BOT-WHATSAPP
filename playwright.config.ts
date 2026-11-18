import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_DATABASE_URL,
  E2E_PORT,
  EVOLUTION,
} from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Os testes compartilham um banco; rodam em sequência.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: E2E_BASE_URL,
      EVOLUTION_API_URL: EVOLUTION.url,
      EVOLUTION_API_KEY: EVOLUTION.apiKey,
      EVOLUTION_INSTANCE: EVOLUTION.instance,
      EVOLUTION_WEBHOOK_SECRET: EVOLUTION.webhookSecret,
    },
  },
});
