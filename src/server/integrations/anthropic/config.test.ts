import { describe, expect, it } from "vitest";
import { readAnthropicConfig } from "./config";

describe("readAnthropicConfig", () => {
  it("sem chave não cria o qualificador e aponta a variável que falta", () => {
    expect(readAnthropicConfig({ ANTHROPIC_API_KEY: "  " })).toMatchObject({
      qualifier: null,
      model: "claude-sonnet-5-5",
      missing: ["ANTHROPIC_API_KEY"],
    });
  });

  it("com chave cria o qualificador e respeita ANTHROPIC_MODEL", () => {
    const config = readAnthropicConfig({
      ANTHROPIC_API_KEY: "sk-ant-teste",
      ANTHROPIC_MODEL: "claude-haiku-5-5",
    });

    expect(config.qualifier).not.toBeNull();
    expect(config).toMatchObject({ model: "claude-haiku-5-5", missing: [] });
  });
});
