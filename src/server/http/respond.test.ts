import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "./errors";
import { handle } from "./respond";

afterEach(() => vi.restoreAllMocks());

const request = new Request("http://localhost:3000/api/x");

describe("handle", () => {
  it("converte AppError na resposta HTTP correspondente", async () => {
    const action = handle(async () => {
      throw new ConflictError("EMAIL_IN_USE", "Já existe.");
    });

    const response = await action(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "EMAIL_IN_USE", message: "Já existe." },
    });
  });

  it("responde 500 genérico, sem vazar detalhes, em erro inesperado", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const action = handle(async () => {
      throw new Error("senha do banco: hunter2");
    });

    const response = await action(request);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL");
    expect(body).not.toContain("hunter2");
    expect(log).toHaveBeenCalledOnce();
  });

  it("deixa passar os sinais internos do Next (erros com digest)", async () => {
    const signal = Object.assign(new Error("bail out"), {
      digest: "NEXT_PRERENDER_INTERRUPTED",
    });
    const action = handle(async () => {
      throw signal;
    });

    await expect(action(request)).rejects.toBe(signal);
  });
});
