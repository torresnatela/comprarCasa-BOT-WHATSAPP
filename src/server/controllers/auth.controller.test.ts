import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { fastHasher } from "../../../tests/hasher";
import { apiRequest, sessionFromResponse } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { createAuthService } from "../services/auth.service";
import { createAuthController } from "./auth.controller";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await createUser(testDb.db, {
    name: "Ana Souza",
    email: "ana@exemplo.com",
    role: "GESTOR",
    passwordHash: await fastHasher.hash("senha-correta"),
  });
});
afterAll(() => testDb.close());

function controller(secureCookies = false) {
  const auth = createAuthService({ db: testDb.db, hasher: fastHasher });
  return createAuthController({ auth, secureCookies });
}

const credentials = { email: "ana@exemplo.com", password: "senha-correta" };

async function login() {
  const response = await controller().login(
    apiRequest("POST", "/api/auth/login", { body: credentials }),
  );
  return sessionFromResponse(response)!;
}

describe("POST /api/auth/login", () => {
  it("responde 200 com o usuário, sem expor o hash da senha", async () => {
    const response = await controller().login(
      apiRequest("POST", "/api/auth/login", { body: credentials }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      role: "GESTOR",
      status: "ATIVO",
    });
    expect(JSON.stringify(body)).not.toMatch(/password|scrypt/i);
  });

  it("define o cookie de sessão httpOnly, SameSite=Lax e com expiração", async () => {
    const response = await controller().login(
      apiRequest("POST", "/api/auth/login", { body: credentials }),
    );
    const cookie = response.headers.get("set-cookie")!;

    expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Expires=\w{3}, \d{2} \w{3} \d{4}/);
    expect(cookie).not.toContain("Secure");
  });

  it("marca o cookie como Secure em produção", async () => {
    const response = await controller(true).login(
      apiRequest("POST", "/api/auth/login", { body: credentials }),
    );

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("responde 401 genérico para credenciais inválidas, sem cookie", async () => {
    const response = await controller().login(
      apiRequest("POST", "/api/auth/login", {
        body: { ...credentials, password: "errada" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos." },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("responde 400 com erros por campo quando o corpo é inválido", async () => {
    const response = await controller().login(
      apiRequest("POST", "/api/auth/login", {
        body: { email: "nao-e-email", password: "" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fields).sort()).toEqual(["email", "password"]);
  });

  it("responde 400 quando o corpo não é JSON", async () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: "{isto não é json",
    });

    const response = await controller().login(request);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
  });

  it("responde 403 para requisição vinda de outra origem", async () => {
    const response = await controller().login(
      apiRequest("POST", "/api/auth/login", {
        body: credentials,
        headers: { origin: "https://site-malicioso.example" },
      }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CROSS_ORIGIN");
  });
});

describe("GET /api/auth/me", () => {
  it("responde 401 sem sessão", async () => {
    const response = await controller().me(apiRequest("GET", "/api/auth/me"));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("responde 200 com o usuário da sessão", async () => {
    const session = await login();

    const response = await controller().me(
      apiRequest("GET", "/api/auth/me", { session }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).user.email).toBe("ana@exemplo.com");
  });
});

describe("POST /api/auth/logout", () => {
  it("responde 204, apaga o cookie e invalida a sessão", async () => {
    const session = await login();

    const response = await controller().logout(
      apiRequest("POST", "/api/auth/logout", { session }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/^session=;.*Max-Age=0/);
    const me = await controller().me(
      apiRequest("GET", "/api/auth/me", { session }),
    );
    expect(me.status).toBe(401);
  });

  it("responde 204 mesmo sem sessão", async () => {
    const response = await controller().logout(
      apiRequest("POST", "/api/auth/logout"),
    );

    expect(response.status).toBe(204);
  });
});
