import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { fastHasher } from "../../../tests/hasher";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { ConflictError, NotFoundError } from "../http/errors";
import { userModel } from "../models/user.model";
import { createAuthService } from "./auth.service";
import { createCollaboratorService } from "./collaborator.service";
import { createInviteService } from "./invite.service";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const deps = () => ({ db: testDb.db, hasher: fastHasher });
const service = () => createCollaboratorService(deps());
const invites = () => createInviteService(deps());
const auth = () => createAuthService(deps());

const gestor = () => createUser(testDb.db, { role: "GESTOR", name: "Gestora" });

const novo = {
  name: "Bia Lima",
  email: "bia@exemplo.com",
  phone: "5511988887777",
  role: "VENDEDOR" as const,
};

describe("collaboratorService.create", () => {
  it("cria o colaborador PENDENTE junto com um convite válido", async () => {
    const actor = await gestor();

    const { user, invite } = await service().create(novo, actor);

    expect(user).toMatchObject({ ...novo, status: "PENDENTE", passwordHash: null });
    expect((await invites().inspect(invite.token)).user.id).toBe(user.id);
  });

  it("recusa e-mail já cadastrado e não deixa convite órfão", async () => {
    const actor = await gestor();
    await service().create(novo, actor);

    const attempt = service().create({ ...novo, name: "Outra Bia" }, actor);

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ code: "EMAIL_IN_USE" });
    expect(await service().list()).toHaveLength(2);
  });
});

describe("collaboratorService.list", () => {
  it("lista todos os colaboradores por nome", async () => {
    await createUser(testDb.db, { name: "Zeca" });
    await createUser(testDb.db, { name: "Alice" });

    expect((await service().list()).map((u) => u.name)).toEqual(["Alice", "Zeca"]);
  });
});

describe("collaboratorService.update", () => {
  it("edita nome, e-mail, telefone e papel", async () => {
    const actor = await gestor();
    const target = await createUser(testDb.db);

    const updated = await service().update(
      target.id,
      { name: "Novo Nome", email: "novo@exemplo.com", phone: "5521977776666", role: "GESTOR" },
      actor,
    );

    expect(updated).toMatchObject({
      name: "Novo Nome",
      email: "novo@exemplo.com",
      phone: "5521977776666",
      role: "GESTOR",
    });
  });

  it("recusa colaborador inexistente", async () => {
    const actor = await gestor();

    await expect(
      service().update("00000000-0000-4000-8000-000000000000", { name: "X" }, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recusa e-mail que já é de outro colaborador", async () => {
    const actor = await gestor();
    await createUser(testDb.db, { email: "ocupado@exemplo.com" });
    const target = await createUser(testDb.db);

    await expect(
      service().update(target.id, { email: "ocupado@exemplo.com" }, actor),
    ).rejects.toMatchObject({ code: "EMAIL_IN_USE" });
  });

  it("desativar derruba as sessões e invalida convites pendentes", async () => {
    const actor = await gestor();
    const target = await createUser(testDb.db, {
      email: "alvo@exemplo.com",
      passwordHash: await fastHasher.hash("senha-do-alvo"),
    });
    const session = await auth().createSession(target.id);
    const invite = await invites().createFor(target.id, actor.id);

    const updated = await service().update(target.id, { active: false }, actor);

    expect(updated.status).toBe("INATIVO");
    expect(await auth().getUserByToken(session.token)).toBeNull();
    await expect(invites().inspect(invite.token)).rejects.toMatchObject({
      code: "INVITE_NOT_FOUND",
    });
    await expect(
      auth().login("alvo@exemplo.com", "senha-do-alvo"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("reativar volta para ATIVO quem já tem senha", async () => {
    const actor = await gestor();
    const target = await createUser(testDb.db, {
      status: "INATIVO",
      passwordHash: await fastHasher.hash("senha-qualquer"),
    });

    const updated = await service().update(target.id, { active: true }, actor);

    expect(updated.status).toBe("ATIVO");
  });

  it("reativar volta para PENDENTE quem nunca definiu senha", async () => {
    const actor = await gestor();
    const target = await createUser(testDb.db, { status: "INATIVO" });

    const updated = await service().update(target.id, { active: true }, actor);

    expect(updated.status).toBe("PENDENTE");
  });

  it("active: true não mexe no status de quem não está inativo", async () => {
    const actor = await gestor();
    const target = await createUser(testDb.db, { status: "PENDENTE" });

    const updated = await service().update(target.id, { active: true }, actor);

    expect(updated.status).toBe("PENDENTE");
  });

  it("gestor não pode desativar a si mesmo", async () => {
    const actor = await gestor();
    await createUser(testDb.db, { role: "GESTOR" });

    await expect(
      service().update(actor.id, { active: false }, actor),
    ).rejects.toMatchObject({ code: "CANNOT_DEACTIVATE_SELF" });
  });

  it("não deixa o último gestor ativo virar vendedor", async () => {
    const actor = await gestor();
    await createUser(testDb.db, { role: "GESTOR", status: "INATIVO" });

    await expect(
      service().update(actor.id, { role: "VENDEDOR" }, actor),
    ).rejects.toMatchObject({ code: "LAST_MANAGER" });
    expect((await userModel(testDb.db).findById(actor.id))?.role).toBe("GESTOR");
  });

  it("permite rebaixar um gestor quando existe outro ativo", async () => {
    const actor = await gestor();
    const other = await createUser(testDb.db, { role: "GESTOR" });

    const updated = await service().update(other.id, { role: "VENDEDOR" }, actor);

    expect(updated.role).toBe("VENDEDOR");
  });
});
