import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import { api, ApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("envia JSON e devolve o corpo da resposta", async () => {
    const { calls } = mockApi({ "POST /api/coisa": { status: 201, body: { ok: true } } });

    const result = await api<{ ok: boolean }>("/api/coisa", {
      method: "POST",
      body: { nome: "x" },
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ method: "POST", path: "/api/coisa", body: { nome: "x" } }]);
  });

  it("devolve undefined em resposta 204", async () => {
    mockApi({ "POST /api/sair": { status: 204 } });

    expect(await api("/api/sair", { method: "POST" })).toBeUndefined();
  });

  it("lança ApiError com código, mensagem e campos do servidor", async () => {
    mockApi({
      "POST /api/coisa": apiError(400, "VALIDATION", "Dados inválidos.", {
        email: "E-mail inválido.",
      }),
    });

    const error = await api("/api/coisa", { method: "POST", body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION",
      message: "Dados inválidos.",
      fields: { email: "E-mail inválido." },
    });
  });

  it("lança ApiError genérico quando a rede falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const error = await api("/api/coisa").catch((e) => e);

    expect(error).toMatchObject({
      code: "NETWORK",
      message: "Não foi possível conectar. Verifique sua internet e tente de novo.",
    });
  });
});
