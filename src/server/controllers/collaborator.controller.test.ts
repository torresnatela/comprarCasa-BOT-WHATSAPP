import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, routeParams } from "../../../tests/app";
import { createUser } from "../../../tests/factories";
import { apiRequest } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

async function setup(role: "GESTOR" | "VENDEDOR" = "GESTOR", appUrl?: string) {
  const app = createTestApp(testDb.db, appUrl);
  const actor = await createUser(testDb.db, { role, name: "Quem Chama" });
  const { token } = await app.services.auth.createSession(actor.id);
  return { ...app, actor, session: token };
}

const novo = {
  name: "Bia Lima",
  email: "Bia@Exemplo.com",
  phone: "(11) 98888-7777",
  role: "VENDEDOR",
};

describe("GET /api/colaboradores", () => {
  it("lista os colaboradores para o gestor, sem dados sensíveis", async () => {
    const { controllers, session } = await setup();
    await createUser(testDb.db, { name: "Alice", passwordHash: "scrypt$segredo" });

    const response = await controllers.collaborator.list(
      apiRequest("GET", "/api/colaboradores", { session }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.collaborators.map((c: { name: string }) => c.name)).toEqual([
      "Alice",
      "Quem Chama",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/password|segredo/i);
  });

  it("responde 401 sem sessão", async () => {
    const { controllers } = await setup();

    const response = await controllers.collaborator.list(
      apiRequest("GET", "/api/colaboradores"),
    );

    expect(response.status).toBe(401);
  });

  it("responde 403 para vendedor", async () => {
    const { controllers, session } = await setup("VENDEDOR");

    const response = await controllers.collaborator.list(
      apiRequest("GET", "/api/colaboradores", { session }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });
});

describe("POST /api/colaboradores", () => {
  it("cria o colaborador e devolve o link de convite", async () => {
    const { controllers, services, session } = await setup();

    const response = await controllers.collaborator.create(
      apiRequest("POST", "/api/colaboradores", { session, body: novo }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.collaborator).toMatchObject({
      name: "Bia Lima",
      email: "bia@exemplo.com",
      phone: "5511988887777",
      role: "VENDEDOR",
      status: "PENDENTE",
      messageAccess: "PROPRIAS",
    });
    expect(body.invite.url).toMatch(
      /^http:\/\/localhost:3000\/convite\/[A-Za-z0-9_-]{43}$/,
    );
    expect(new Date(body.invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const token = body.invite.url.split("/").pop();
    expect((await services.invites.inspect(token)).user.email).toBe("bia@exemplo.com");
  });

  it("usa APP_URL para montar o link quando configurada", async () => {
    const { controllers, session } = await setup("GESTOR", "https://portal.imobiliaria.com/");

    const response = await controllers.collaborator.create(
      apiRequest("POST", "/api/colaboradores", { session, body: novo }),
    );

    expect((await response.json()).invite.url).toMatch(
      /^https:\/\/portal\.imobiliaria\.com\/convite\/[A-Za-z0-9_-]{43}$/,
    );
  });

  it("responde 400 com erros por campo", async () => {
    const { controllers, session } = await setup();

    const response = await controllers.collaborator.create(
      apiRequest("POST", "/api/colaboradores", {
        session,
        body: { name: "B", email: "x", phone: "123", role: "CHEFE" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(Object.keys(body.error.fields).sort()).toEqual([
      "email",
      "name",
      "phone",
      "role",
    ]);
  });

  it("responde 409 para e-mail já cadastrado", async () => {
    const { controllers, session } = await setup();
    await createUser(testDb.db, { email: "bia@exemplo.com" });

    const response = await controllers.collaborator.create(
      apiRequest("POST", "/api/colaboradores", { session, body: novo }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("EMAIL_IN_USE");
  });

  it("responde 403 para vendedor e não cria nada", async () => {
    const { controllers, services, session } = await setup("VENDEDOR");

    const response = await controllers.collaborator.create(
      apiRequest("POST", "/api/colaboradores", { session, body: novo }),
    );

    expect(response.status).toBe(403);
    expect(await services.collaborators.list()).toHaveLength(1);
  });
});

describe("PATCH /api/colaboradores/[id]", () => {
  it("atualiza os dados do colaborador", async () => {
    const { controllers, session } = await setup();
    const target = await createUser(testDb.db);

    const response = await controllers.collaborator.update(
      apiRequest("PATCH", `/api/colaboradores/${target.id}`, {
        session,
        body: { name: "Nome Editado", active: false },
      }),
      routeParams({ id: target.id }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).collaborator).toMatchObject({
      id: target.id,
      name: "Nome Editado",
      status: "INATIVO",
    });
  });

  it("responde 404 para id inexistente ou malformado", async () => {
    const { controllers, session } = await setup();

    for (const id of ["00000000-0000-4000-8000-000000000000", "nao-e-uuid"]) {
      const response = await controllers.collaborator.update(
        apiRequest("PATCH", `/api/colaboradores/${id}`, { session, body: { name: "Xis" } }),
        routeParams({ id }),
      );
      expect(response.status).toBe(404);
    }
  });

  it("responde 409 quando o gestor tenta se desativar", async () => {
    const { controllers, actor, session } = await setup();

    const response = await controllers.collaborator.update(
      apiRequest("PATCH", `/api/colaboradores/${actor.id}`, {
        session,
        body: { active: false },
      }),
      routeParams({ id: actor.id }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CANNOT_DEACTIVATE_SELF");
  });

  it("responde 403 para vendedor", async () => {
    const { controllers, actor, session } = await setup("VENDEDOR");

    const response = await controllers.collaborator.update(
      apiRequest("PATCH", `/api/colaboradores/${actor.id}`, {
        session,
        body: { role: "GESTOR" },
      }),
      routeParams({ id: actor.id }),
    );

    expect(response.status).toBe(403);
  });
});

describe("POST /api/colaboradores/[id]/convite", () => {
  it("gera um novo link e invalida o anterior", async () => {
    const { controllers, services, actor, session } = await setup();
    const target = await createUser(testDb.db, { status: "PENDENTE" });
    const previous = await services.invites.createFor(target.id, actor.id);

    const response = await controllers.collaborator.regenerateInvite(
      apiRequest("POST", `/api/colaboradores/${target.id}/convite`, { session }),
      routeParams({ id: target.id }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.invite.url).toContain("/convite/");
    await expect(services.invites.inspect(previous.token)).rejects.toMatchObject({
      code: "INVITE_NOT_FOUND",
    });
  });

  it("responde 409 para colaborador inativo", async () => {
    const { controllers, session } = await setup();
    const target = await createUser(testDb.db, { status: "INATIVO" });

    const response = await controllers.collaborator.regenerateInvite(
      apiRequest("POST", `/api/colaboradores/${target.id}/convite`, { session }),
      routeParams({ id: target.id }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("USER_INACTIVE");
  });

  it("responde 403 para vendedor", async () => {
    const { controllers, actor, session } = await setup("VENDEDOR");

    const response = await controllers.collaborator.regenerateInvite(
      apiRequest("POST", `/api/colaboradores/${actor.id}/convite`, { session }),
      routeParams({ id: actor.id }),
    );

    expect(response.status).toBe(403);
  });
});

describe("acesso do vendedor às mensagens", () => {
  it("cadastra com o acesso escolhido e edita depois", async () => {
    const { controllers, session } = await setup();

    const created = await controllers.collaborator.create(
      apiRequest("POST", "/api/colaboradores", {
        session,
        body: { ...novo, messageAccess: "TODAS" },
      }),
    );
    const { collaborator } = await created.json();
    expect(created.status).toBe(201);
    expect(collaborator.messageAccess).toBe("TODAS");

    const updated = await controllers.collaborator.update(
      apiRequest("PATCH", `/api/colaboradores/${collaborator.id}`, {
        session,
        body: { messageAccess: "NENHUMA" },
      }),
      routeParams({ id: collaborator.id }),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).collaborator.messageAccess).toBe("NENHUMA");
  });

  it("recusa um acesso inválido", async () => {
    const { controllers, session } = await setup();
    const target = await createUser(testDb.db);

    const response = await controllers.collaborator.update(
      apiRequest("PATCH", `/api/colaboradores/${target.id}`, {
        session,
        body: { messageAccess: "ALGUMAS" },
      }),
      routeParams({ id: target.id }),
    );

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fields)).toEqual(["messageAccess"]);
  });
});
