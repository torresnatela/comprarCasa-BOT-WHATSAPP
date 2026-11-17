import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { sessionModel } from "./session.model";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const expiresAt = new Date("2030-01-01T00:00:00Z");

describe("sessionModel", () => {
  it("cria e busca sessão pelo hash do token", async () => {
    const user = await createUser(testDb.db);
    const model = sessionModel(testDb.db);

    await model.create({ tokenHash: "hash-1", userId: user.id, expiresAt });
    const found = await model.findByTokenHash("hash-1");

    expect(found).toMatchObject({ userId: user.id, expiresAt });
    expect(await model.findByTokenHash("outro")).toBeNull();
  });

  it("apaga uma sessão pelo hash do token", async () => {
    const user = await createUser(testDb.db);
    const model = sessionModel(testDb.db);
    await model.create({ tokenHash: "hash-1", userId: user.id, expiresAt });
    await model.create({ tokenHash: "hash-2", userId: user.id, expiresAt });

    await model.deleteByTokenHash("hash-1");

    expect(await model.findByTokenHash("hash-1")).toBeNull();
    expect(await model.findByTokenHash("hash-2")).not.toBeNull();
  });

  it("apaga todas as sessões de um usuário, sem tocar nas de outros", async () => {
    const ana = await createUser(testDb.db);
    const bia = await createUser(testDb.db);
    const model = sessionModel(testDb.db);
    await model.create({ tokenHash: "ana-1", userId: ana.id, expiresAt });
    await model.create({ tokenHash: "ana-2", userId: ana.id, expiresAt });
    await model.create({ tokenHash: "bia-1", userId: bia.id, expiresAt });

    await model.deleteByUserId(ana.id);

    expect(await model.findByTokenHash("ana-1")).toBeNull();
    expect(await model.findByTokenHash("ana-2")).toBeNull();
    expect(await model.findByTokenHash("bia-1")).not.toBeNull();
  });
});
