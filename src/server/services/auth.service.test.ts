import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { fastHasher } from "../../../tests/hasher";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { UnauthorizedError } from "../http/errors";
import { sessionModel } from "../models/session.model";
import { userModel } from "../models/user.model";
import { createAuthService, SESSION_TTL_MS } from "./auth.service";
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

const service = () =>
  createAuthService({ db: testDb.db, hasher: fastHasher, now: () => now });

async function activeUser(overrides = {}) {
  return createUser(testDb.db, {
    email: "ana@exemplo.com",
    passwordHash: await fastHasher.hash("senha-correta"),
    status: "ATIVO",
    ...overrides,
  });
}

describe("authService.login", () => {
  it("cria sessão de 7 dias e guarda só o hash do token", async () => {
    const user = await activeUser();

    const result = await service().login("ana@exemplo.com", "senha-correta");

    expect(result.user.id).toBe(user.id);
    expect(result.session.expiresAt.getTime()).toBe(
      now.getTime() + SESSION_TTL_MS,
    );
    const sessions = sessionModel(testDb.db);
    expect(await sessions.findByTokenHash(result.session.token)).toBeNull();
    expect(
      await sessions.findByTokenHash(hashToken(result.session.token)),
    ).toMatchObject({ userId: user.id });
  });

  it("aceita e-mail com maiúsculas e espaços", async () => {
    await activeUser();

    const result = await service().login(" ANA@Exemplo.com ", "senha-correta");

    expect(result.user.email).toBe("ana@exemplo.com");
  });

  it.each([
    ["senha errada", "ana@exemplo.com", "senha-errada", {}],
    ["e-mail desconhecido", "ninguem@exemplo.com", "senha-correta", {}],
    ["usuário inativo", "ana@exemplo.com", "senha-correta", { status: "INATIVO" }],
    ["usuário pendente", "ana@exemplo.com", "senha-correta", { status: "PENDENTE" }],
    ["usuário sem senha", "ana@exemplo.com", "", { passwordHash: null }],
  ])("recusa %s com o mesmo erro genérico", async (_caso, email, senha, extra) => {
    await activeUser(extra);

    const attempt = service().login(email, senha);

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "E-mail ou senha inválidos.",
    });
  });
});

describe("authService.getUserByToken", () => {
  it("devolve o usuário de uma sessão válida", async () => {
    const user = await activeUser();
    const { session } = await service().login("ana@exemplo.com", "senha-correta");

    expect((await service().getUserByToken(session.token))?.id).toBe(user.id);
  });

  it("devolve null sem token ou com token desconhecido", async () => {
    expect(await service().getUserByToken(undefined)).toBeNull();
    expect(await service().getUserByToken("")).toBeNull();
    expect(await service().getUserByToken("token-inventado")).toBeNull();
  });

  it("recusa e apaga sessão expirada", async () => {
    await activeUser();
    const { session } = await service().login("ana@exemplo.com", "senha-correta");

    now = new Date(now.getTime() + SESSION_TTL_MS + 1);

    expect(await service().getUserByToken(session.token)).toBeNull();
    expect(
      await sessionModel(testDb.db).findByTokenHash(hashToken(session.token)),
    ).toBeNull();
  });

  it("recusa sessão de usuário que foi desativado", async () => {
    const user = await activeUser();
    const { session } = await service().login("ana@exemplo.com", "senha-correta");

    await userModel(testDb.db).update(user.id, { status: "INATIVO" });

    expect(await service().getUserByToken(session.token)).toBeNull();
  });
});

describe("authService.logout", () => {
  it("invalida só a sessão informada", async () => {
    await activeUser();
    const first = await service().login("ana@exemplo.com", "senha-correta");
    const second = await service().login("ana@exemplo.com", "senha-correta");

    await service().logout(first.session.token);

    expect(await service().getUserByToken(first.session.token)).toBeNull();
    expect(await service().getUserByToken(second.session.token)).not.toBeNull();
  });
});
