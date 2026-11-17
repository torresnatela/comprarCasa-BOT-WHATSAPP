import { describe, expect, it } from "vitest";
import { createPasswordHasher } from "./password";

// Custo baixo só para os testes rodarem rápido.
const hasher = createPasswordHasher({ N: 1024, r: 8, p: 1 });

describe("password hasher", () => {
  it("gera hash que não contém a senha e valida a senha correta", async () => {
    const hash = await hasher.hash("senha-secreta");

    expect(hash).not.toContain("senha-secreta");
    expect(await hasher.verify("senha-secreta", hash)).toBe(true);
  });

  it("recusa senha errada", async () => {
    const hash = await hasher.hash("senha-secreta");

    expect(await hasher.verify("senha-errada", hash)).toBe(false);
  });

  it("usa salt aleatório: mesma senha gera hashes diferentes", async () => {
    expect(await hasher.hash("igual")).not.toBe(await hasher.hash("igual"));
  });

  it("valida hash gerado com outro custo (parâmetros ficam no próprio hash)", async () => {
    const outro = createPasswordHasher({ N: 2048, r: 8, p: 1 });
    const hash = await outro.hash("senha-secreta");

    expect(await hasher.verify("senha-secreta", hash)).toBe(true);
  });

  it.each(["", "texto-qualquer", "scrypt$abc$8$1$x$y", "scrypt$1024$8$1$$"])(
    "devolve false para hash malformado: %j",
    async (malformed) => {
      expect(await hasher.verify("senha", malformed)).toBe(false);
    },
  );
});
