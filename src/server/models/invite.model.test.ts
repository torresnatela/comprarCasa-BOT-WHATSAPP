import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { inviteModel } from "./invite.model";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const expiresAt = new Date("2030-01-01T00:00:00Z");

async function seed() {
  const gestor = await createUser(testDb.db, { role: "GESTOR" });
  const vendedor = await createUser(testDb.db, { status: "PENDENTE" });
  return { gestor, vendedor };
}

describe("inviteModel", () => {
  it("cria e busca convite pelo hash do token", async () => {
    const { gestor, vendedor } = await seed();
    const model = inviteModel(testDb.db);

    const created = await model.create({
      tokenHash: "hash-1",
      userId: vendedor.id,
      createdBy: gestor.id,
      expiresAt,
    });

    expect(created.usedAt).toBeNull();
    expect((await model.findByTokenHash("hash-1"))?.id).toBe(created.id);
    expect(await model.findByTokenHash("outro")).toBeNull();
  });

  it("marca como usado uma única vez", async () => {
    const { gestor, vendedor } = await seed();
    const model = inviteModel(testDb.db);
    const invite = await model.create({
      tokenHash: "hash-1",
      userId: vendedor.id,
      createdBy: gestor.id,
      expiresAt,
    });
    const usedAt = new Date("2029-06-01T12:00:00Z");

    expect(await model.markUsed(invite.id, usedAt)).toBe(true);
    expect(await model.markUsed(invite.id, new Date())).toBe(false);
    expect((await model.findByTokenHash("hash-1"))?.usedAt).toEqual(usedAt);
  });

  it("apaga só os convites não usados do usuário", async () => {
    const { gestor, vendedor } = await seed();
    const outro = await createUser(testDb.db, { status: "PENDENTE" });
    const model = inviteModel(testDb.db);
    const base = { createdBy: gestor.id, expiresAt };
    const usado = await model.create({
      ...base,
      tokenHash: "usado",
      userId: vendedor.id,
    });
    await model.markUsed(usado.id, new Date());
    await model.create({ ...base, tokenHash: "aberto", userId: vendedor.id });
    await model.create({ ...base, tokenHash: "de-outro", userId: outro.id });

    await model.deleteUnusedByUserId(vendedor.id);

    expect(await model.findByTokenHash("aberto")).toBeNull();
    expect(await model.findByTokenHash("usado")).not.toBeNull();
    expect(await model.findByTokenHash("de-outro")).not.toBeNull();
  });
});
