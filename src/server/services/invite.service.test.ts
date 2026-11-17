import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { fastHasher } from "../../../tests/hasher";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { ConflictError, GoneError, NotFoundError } from "../http/errors";
import { inviteModel } from "../models/invite.model";
import { userModel } from "../models/user.model";
import { createAuthService } from "./auth.service";
import { createInviteService, INVITE_TTL_MS } from "./invite.service";
import { hashToken } from "./token";

let testDb: TestDb;
let now: Date;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  now = new Date("2026-11-17T12:00:00Z");
});
afterAll(() => testDb.close());

const deps = () => ({ db: testDb.db, hasher: fastHasher, now: () => now });
const service = () => createInviteService(deps());
const auth = () => createAuthService(deps());

async function seed(overrides = {}) {
  const gestor = await createUser(testDb.db, { role: "GESTOR" });
  const vendedor = await createUser(testDb.db, {
    name: "Bia Lima",
    email: "bia@exemplo.com",
    status: "PENDENTE",
    ...overrides,
  });
  return { gestor, vendedor };
}

describe("inviteService.createFor", () => {
  it("gera convite de 7 dias guardando só o hash do token", async () => {
    const { gestor, vendedor } = await seed();

    const invite = await service().createFor(vendedor.id, gestor.id);

    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invite.expiresAt.getTime()).toBe(now.getTime() + INVITE_TTL_MS);
    const stored = await inviteModel(testDb.db).findByTokenHash(
      hashToken(invite.token),
    );
    expect(stored).toMatchObject({ userId: vendedor.id, createdBy: gestor.id });
  });

  it("invalida o convite anterior ao gerar um novo", async () => {
    const { gestor, vendedor } = await seed();

    const first = await service().createFor(vendedor.id, gestor.id);
    const second = await service().createFor(vendedor.id, gestor.id);

    await expect(service().inspect(first.token)).rejects.toMatchObject({
      code: "INVITE_NOT_FOUND",
    });
    await expect(service().inspect(second.token)).resolves.toBeDefined();
  });

  it("recusa usuário inexistente", async () => {
    const { gestor } = await seed();

    await expect(
      service().createFor("00000000-0000-4000-8000-000000000000", gestor.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recusa usuário inativo", async () => {
    const { gestor, vendedor } = await seed({ status: "INATIVO" });

    const attempt = service().createFor(vendedor.id, gestor.id);

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ code: "USER_INACTIVE" });
  });
});

describe("inviteService.inspect", () => {
  it("devolve os dados do convidado para um convite válido", async () => {
    const { gestor, vendedor } = await seed();
    const invite = await service().createFor(vendedor.id, gestor.id);

    const result = await service().inspect(invite.token);

    expect(result.user).toMatchObject({ name: "Bia Lima", email: "bia@exemplo.com" });
    expect(result.invite.expiresAt).toEqual(invite.expiresAt);
  });

  it("recusa token desconhecido", async () => {
    const attempt = service().inspect("token-inventado");

    await expect(attempt).rejects.toBeInstanceOf(GoneError);
    await expect(attempt).rejects.toMatchObject({ code: "INVITE_NOT_FOUND" });
  });

  it("recusa convite expirado", async () => {
    const { gestor, vendedor } = await seed();
    const invite = await service().createFor(vendedor.id, gestor.id);

    now = new Date(now.getTime() + INVITE_TTL_MS);

    await expect(service().inspect(invite.token)).rejects.toMatchObject({
      code: "INVITE_EXPIRED",
    });
  });

  it("recusa convite de usuário desativado depois da geração", async () => {
    const { gestor, vendedor } = await seed();
    const invite = await service().createFor(vendedor.id, gestor.id);
    await userModel(testDb.db).update(vendedor.id, { status: "INATIVO" });

    await expect(service().inspect(invite.token)).rejects.toMatchObject({
      code: "INVITE_NOT_FOUND",
    });
  });
});

describe("inviteService.accept", () => {
  it("define a senha, ativa o usuário e já devolve uma sessão", async () => {
    const { gestor, vendedor } = await seed();
    const invite = await service().createFor(vendedor.id, gestor.id);

    const result = await service().accept(invite.token, "minha-senha-nova");

    expect(result.user).toMatchObject({ id: vendedor.id, status: "ATIVO" });
    expect((await auth().getUserByToken(result.session.token))?.id).toBe(vendedor.id);
    const login = await auth().login("bia@exemplo.com", "minha-senha-nova");
    expect(login.user.id).toBe(vendedor.id);
  });

  it("não pode ser usado duas vezes", async () => {
    const { gestor, vendedor } = await seed();
    const invite = await service().createFor(vendedor.id, gestor.id);
    await service().accept(invite.token, "minha-senha-nova");

    const again = service().accept(invite.token, "outra-senha-qualquer");

    await expect(again).rejects.toBeInstanceOf(GoneError);
    await expect(again).rejects.toMatchObject({ code: "INVITE_USED" });
    await expect(
      auth().login("bia@exemplo.com", "outra-senha-qualquer"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("recusa convite expirado sem alterar o usuário", async () => {
    const { gestor, vendedor } = await seed();
    const invite = await service().createFor(vendedor.id, gestor.id);
    now = new Date(now.getTime() + INVITE_TTL_MS + 1);

    await expect(
      service().accept(invite.token, "minha-senha-nova"),
    ).rejects.toMatchObject({ code: "INVITE_EXPIRED" });
    expect(await userModel(testDb.db).findById(vendedor.id)).toMatchObject({
      status: "PENDENTE",
      passwordHash: null,
    });
  });

  it("em usuário já ativo, troca a senha e derruba as sessões antigas", async () => {
    const { gestor, vendedor } = await seed({
      status: "ATIVO",
      passwordHash: await fastHasher.hash("senha-antiga"),
    });
    const oldSession = await auth().login("bia@exemplo.com", "senha-antiga");
    const invite = await service().createFor(vendedor.id, gestor.id);

    const result = await service().accept(invite.token, "senha-novinha");

    expect(await auth().getUserByToken(oldSession.session.token)).toBeNull();
    expect(await auth().getUserByToken(result.session.token)).not.toBeNull();
    await expect(
      auth().login("bia@exemplo.com", "senha-antiga"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});
