import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { ConflictError } from "../http/errors";
import { userModel } from "./user.model";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const novoVendedor = {
  name: "Ana Souza",
  email: "ana@exemplo.com",
  phone: "5511999990000",
  role: "VENDEDOR" as const,
};

describe("userModel", () => {
  it("cria usuário PENDENTE e sem senha por padrão", async () => {
    const user = await userModel(testDb.db).create(novoVendedor);

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user).toMatchObject({
      ...novoVendedor,
      status: "PENDENTE",
      passwordHash: null,
    });
  });

  it("normaliza o e-mail (minúsculas, sem espaços) ao criar e ao buscar", async () => {
    const model = userModel(testDb.db);
    const created = await model.create({
      ...novoVendedor,
      email: "  Ana@Exemplo.COM ",
    });

    expect(created.email).toBe("ana@exemplo.com");
    expect((await model.findByEmail("ANA@exemplo.com"))?.id).toBe(created.id);
  });

  it("rejeita e-mail duplicado com ConflictError", async () => {
    const model = userModel(testDb.db);
    await model.create(novoVendedor);

    await expect(
      model.create({ ...novoVendedor, name: "Outra Ana" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("busca por id e devolve null quando não existe", async () => {
    const model = userModel(testDb.db);
    const created = await model.create(novoVendedor);

    expect((await model.findById(created.id))?.email).toBe("ana@exemplo.com");
    expect(
      await model.findById("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await model.findByEmail("ninguem@exemplo.com")).toBeNull();
  });

  it("lista os usuários em ordem alfabética", async () => {
    await createUser(testDb.db, { name: "Carlos" });
    await createUser(testDb.db, { name: "Ana" });
    await createUser(testDb.db, { name: "Bruna" });

    const names = (await userModel(testDb.db).list()).map((u) => u.name);

    expect(names).toEqual(["Ana", "Bruna", "Carlos"]);
  });

  it("atualiza campos e o updatedAt", async () => {
    const model = userModel(testDb.db);
    const created = await createUser(testDb.db, {
      updatedAt: new Date("2020-01-01T00:00:00Z"),
    });

    const updated = await model.update(created.id, {
      status: "INATIVO",
      email: "NOVO@exemplo.com",
    });

    expect(updated?.status).toBe("INATIVO");
    expect(updated?.email).toBe("novo@exemplo.com");
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
  });

  it("devolve null ao atualizar usuário inexistente", async () => {
    const updated = await userModel(testDb.db).update(
      "00000000-0000-4000-8000-000000000000",
      { name: "X" },
    );

    expect(updated).toBeNull();
  });

  it("rejeita troca para e-mail já usado com ConflictError", async () => {
    const model = userModel(testDb.db);
    await createUser(testDb.db, { email: "a@exemplo.com" });
    const other = await createUser(testDb.db, { email: "b@exemplo.com" });

    await expect(
      model.update(other.id, { email: "a@exemplo.com" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("conta apenas gestores ativos", async () => {
    await createUser(testDb.db, { role: "GESTOR", status: "ATIVO" });
    await createUser(testDb.db, { role: "GESTOR", status: "INATIVO" });
    await createUser(testDb.db, { role: "GESTOR", status: "PENDENTE" });
    await createUser(testDb.db, { role: "VENDEDOR", status: "ATIVO" });

    expect(await userModel(testDb.db).countActiveGestores()).toBe(1);
  });
});

describe("userModel rodízio", () => {
  const at = (minute: number) => new Date(`2026-11-17T12:${String(minute).padStart(2, "0")}:00Z`);

  it("escolhe primeiro quem nunca recebeu, depois quem recebeu há mais tempo", async () => {
    const recente = await createUser(testDb.db, { lastAssignedAt: at(30) });
    const antigo = await createUser(testDb.db, { lastAssignedAt: at(10) });
    const nunca = await createUser(testDb.db);
    const model = userModel(testDb.db);

    expect((await model.lockNextInRotation())?.id).toBe(nunca.id);
    await model.markAssigned(nunca.id, at(40));
    expect((await model.lockNextInRotation())?.id).toBe(antigo.id);
    await model.markAssigned(antigo.id, at(41));
    expect((await model.lockNextInRotation())?.id).toBe(recente.id);
  });

  it("ignora gestor, vendedor inativo/pendente e quem está fora da fila", async () => {
    await createUser(testDb.db, { role: "GESTOR" });
    await createUser(testDb.db, { status: "INATIVO" });
    await createUser(testDb.db, { status: "PENDENTE" });
    await createUser(testDb.db, { inRotation: false });

    expect(await userModel(testDb.db).lockNextInRotation()).toBeNull();
  });

  it("lista vendedores ativos na ordem da fila, com quem está fora no fim", async () => {
    const fora = await createUser(testDb.db, { name: "Fora" });
    const segundo = await createUser(testDb.db, { name: "Segundo", lastAssignedAt: at(20) });
    const primeiro = await createUser(testDb.db, { name: "Primeiro", lastAssignedAt: at(5) });
    await createUser(testDb.db, { role: "GESTOR" });
    const model = userModel(testDb.db);
    await model.setInRotation(fora.id, false);

    const list = await model.listRotation();

    expect(list.map((entry) => entry.user.id)).toEqual([primeiro.id, segundo.id, fora.id]);
    expect(list[0].assignedLeads).toBe(0);
  });
});
