import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, routeParams } from "../../../tests/app";
import { createUser } from "../../../tests/factories";
import { apiRequest, sessionFromResponse } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

async function setup() {
  const app = createTestApp(testDb.db);
  const gestor = await createUser(testDb.db, { role: "GESTOR" });
  const convidado = await createUser(testDb.db, {
    name: "Bia Lima",
    email: "bia@exemplo.com",
    status: "PENDENTE",
  });
  const invite = await app.services.invites.createFor(convidado.id, gestor.id);
  return { ...app, convidado, token: invite.token };
}

describe("GET /api/convites/[token]", () => {
  it("devolve nome e e-mail do convidado, sem exigir login", async () => {
    const { controllers, token } = await setup();

    const response = await controllers.invite.show(
      apiRequest("GET", `/api/convites/${token}`),
      routeParams({ token }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite).toMatchObject({ name: "Bia Lima", email: "bia@exemplo.com" });
    expect(Object.keys(body.invite).sort()).toEqual(["email", "expiresAt", "name"]);
  });

  it("responde 410 para token inválido", async () => {
    const { controllers } = await setup();

    const response = await controllers.invite.show(
      apiRequest("GET", "/api/convites/inventado"),
      routeParams({ token: "inventado" }),
    );

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("INVITE_NOT_FOUND");
  });
});

describe("POST /api/convites/[token]", () => {
  it("define a senha, ativa a conta e já devolve o cookie de sessão", async () => {
    const { controllers, convidado, token } = await setup();

    const response = await controllers.invite.accept(
      apiRequest("POST", `/api/convites/${token}`, {
        body: { password: "minha-senha-nova" },
      }),
      routeParams({ token }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({
      id: convidado.id,
      status: "ATIVO",
    });
    const session = sessionFromResponse(response)!;
    const me = await controllers.auth.me(
      apiRequest("GET", "/api/auth/me", { session }),
    );
    expect(me.status).toBe(200);
  });

  it("responde 400 para senha curta e mantém o convite utilizável", async () => {
    const { controllers, token } = await setup();

    const weak = await controllers.invite.accept(
      apiRequest("POST", `/api/convites/${token}`, { body: { password: "1234567" } }),
      routeParams({ token }),
    );
    const retry = await controllers.invite.accept(
      apiRequest("POST", `/api/convites/${token}`, { body: { password: "12345678" } }),
      routeParams({ token }),
    );

    expect(weak.status).toBe(400);
    expect((await weak.json()).error.fields.password).toMatch(/8 caracteres/);
    expect(weak.headers.get("set-cookie")).toBeNull();
    expect(retry.status).toBe(200);
  });

  it("responde 410 ao reutilizar o link", async () => {
    const { controllers, token } = await setup();
    const accept = () =>
      controllers.invite.accept(
        apiRequest("POST", `/api/convites/${token}`, {
          body: { password: "minha-senha-nova" },
        }),
        routeParams({ token }),
      );
    await accept();

    const again = await accept();

    expect(again.status).toBe(410);
    expect((await again.json()).error.code).toBe("INVITE_USED");
  });
});
