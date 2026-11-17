import { describe, expect, it } from "vitest";
import { readEvolutionConfig } from "./config";

const complete = {
  EVOLUTION_API_URL: "https://evolution.exemplo.com",
  EVOLUTION_API_KEY: "chave",
  EVOLUTION_INSTANCE: "Comprarcasa Teste",
  EVOLUTION_WEBHOOK_SECRET: "segredo-com-pelo-menos-16",
};

describe("readEvolutionConfig", () => {
  it("monta o cliente quando tudo está definido", () => {
    const config = readEvolutionConfig(complete);

    expect(config.missing).toEqual([]);
    expect(config.client?.instance).toBe("Comprarcasa Teste");
    expect(config.webhookSecret).toBe("segredo-com-pelo-menos-16");
    expect(config.instance).toBe("Comprarcasa Teste");
  });

  it("fica sem cliente e lista o que falta", () => {
    const config = readEvolutionConfig({
      ...complete,
      EVOLUTION_API_KEY: "",
      EVOLUTION_WEBHOOK_SECRET: undefined,
    });

    expect(config.client).toBeNull();
    expect(config.webhookSecret).toBeNull();
    expect(config.missing).toEqual(["EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_SECRET"]);
  });

  it("trata segredo curto demais como ausente", () => {
    const config = readEvolutionConfig({ ...complete, EVOLUTION_WEBHOOK_SECRET: "curto" });

    expect(config.webhookSecret).toBeNull();
    expect(config.missing).toEqual(["EVOLUTION_WEBHOOK_SECRET"]);
    expect(config.client).not.toBeNull();
  });
});
