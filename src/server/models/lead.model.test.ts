import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead } from "../../../tests/factories";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { leadModel } from "./lead.model";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const at = new Date("2026-11-17T12:00:00Z");
const novo = {
  whatsappJid: "351912345678@s.whatsapp.net",
  phone: "351912345678",
  name: "Maria Silva",
  lastMessageAt: at,
  lastMessageText: "Olá",
};

describe("leadModel.findOrCreate", () => {
  it("cria o lead na primeira mensagem", async () => {
    const { lead, created } = await leadModel(testDb.db).findOrCreate(novo);

    expect(created).toBe(true);
    expect(lead).toMatchObject(novo);
  });

  it("devolve o lead existente, sem duplicar nem sobrescrever", async () => {
    const model = leadModel(testDb.db);
    const first = await model.findOrCreate(novo);

    const second = await model.findOrCreate({
      ...novo,
      name: "Outro Nome",
      lastMessageText: "Segunda",
    });

    expect(second.created).toBe(false);
    expect(second.lead).toMatchObject({ id: first.lead.id, name: "Maria Silva" });
    expect(await model.list()).toHaveLength(1);
  });
});

describe("leadModel.recordActivity", () => {
  it("atualiza a última mensagem quando ela é mais recente", async () => {
    const model = leadModel(testDb.db);
    const lead = await createLead(testDb.db, { lastMessageAt: at, lastMessageText: "antiga" });
    const later = new Date(at.getTime() + 60_000);

    const updated = await model.recordActivity(lead.id, { at: later, text: "nova" });

    expect(updated).toMatchObject({ lastMessageAt: later, lastMessageText: "nova" });
  });

  it("não regride a última mensagem quando chega uma mais antiga (fora de ordem)", async () => {
    const model = leadModel(testDb.db);
    const lead = await createLead(testDb.db, { lastMessageAt: at, lastMessageText: "atual" });
    const earlier = new Date(at.getTime() - 60_000);

    const updated = await model.recordActivity(lead.id, { at: earlier, text: "velha" });

    expect(updated).toMatchObject({ lastMessageAt: at, lastMessageText: "atual" });
  });

  it("preenche nome e telefone que faltavam, sem trocar os que já existem", async () => {
    const model = leadModel(testDb.db);
    const semDados = await createLead(testDb.db, { name: null, phone: null });
    const comDados = await createLead(testDb.db, { name: "Já Tinha", phone: "351911111111" });
    const activity = { at, text: "oi", name: "Novo Nome", phone: "351922222222" };

    expect(await model.recordActivity(semDados.id, activity)).toMatchObject({
      name: "Novo Nome",
      phone: "351922222222",
    });
    expect(await model.recordActivity(comDados.id, activity)).toMatchObject({
      name: "Já Tinha",
      phone: "351911111111",
    });
  });
});

describe("leadModel — leitura", () => {
  it("lista do mais recente para o mais antigo", async () => {
    await createLead(testDb.db, { name: "Antigo", lastMessageAt: new Date("2026-11-01T10:00:00Z") });
    await createLead(testDb.db, { name: "Recente", lastMessageAt: new Date("2026-11-17T10:00:00Z") });
    await createLead(testDb.db, { name: "Meio", lastMessageAt: new Date("2026-11-10T10:00:00Z") });

    const names = (await leadModel(testDb.db).list()).map((lead) => lead.name);

    expect(names).toEqual(["Recente", "Meio", "Antigo"]);
  });

  it("busca por id e devolve null quando não existe", async () => {
    const lead = await createLead(testDb.db);
    const model = leadModel(testDb.db);

    expect((await model.findById(lead.id))?.id).toBe(lead.id);
    expect(await model.findById("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
