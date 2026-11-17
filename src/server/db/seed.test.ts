import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fastHasher } from "../../../tests/hasher";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { userModel } from "../models/user.model";
import { createAuthService } from "../services/auth.service";
import { seedFirstManager } from "./seed";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const admin = {
  name: "Gestora Inicial",
  email: "Gestora@Exemplo.com",
  password: "senha-inicial-forte",
};

describe("seedFirstManager", () => {
  it("cria um gestor ativo que consegue fazer login", async () => {
    const result = await seedFirstManager(testDb.db, fastHasher, admin);

    expect(result).toBe("created");
    const auth = createAuthService({ db: testDb.db, hasher: fastHasher });
    const { user } = await auth.login("gestora@exemplo.com", "senha-inicial-forte");
    expect(user).toMatchObject({ role: "GESTOR", status: "ATIVO" });
  });

  it("não duplica nem altera a senha se o e-mail já existe", async () => {
    await seedFirstManager(testDb.db, fastHasher, admin);

    const again = await seedFirstManager(testDb.db, fastHasher, {
      ...admin,
      password: "outra-senha-qualquer",
    });

    expect(again).toBe("exists");
    expect(await userModel(testDb.db).list()).toHaveLength(1);
    const auth = createAuthService({ db: testDb.db, hasher: fastHasher });
    await expect(
      auth.login("gestora@exemplo.com", "outra-senha-qualquer"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("recusa dados inválidos (senha curta)", async () => {
    await expect(
      seedFirstManager(testDb.db, fastHasher, { ...admin, password: "curta" }),
    ).rejects.toThrow(/8 caracteres/);
  });
});
