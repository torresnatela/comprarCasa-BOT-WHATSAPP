import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, createUser } from "../../../tests/factories";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { messageModel } from "./message.model";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const base = {
  direction: "RECEBIDA" as const,
  type: "TEXTO" as const,
  text: "Olá",
  sentAt: new Date("2026-11-17T12:00:00Z"),
};

describe("messageModel.insertIfNew", () => {
  it("grava a mensagem", async () => {
    const lead = await createLead(testDb.db);

    const message = await messageModel(testDb.db).insertIfNew({
      ...base,
      leadId: lead.id,
      externalId: "MSG-1",
    });

    expect(message).toMatchObject({ ...base, leadId: lead.id, externalId: "MSG-1", sentBy: null });
  });

  it("devolve null e não duplica quando o id externo já existe", async () => {
    const lead = await createLead(testDb.db);
    const model = messageModel(testDb.db);
    await model.insertIfNew({ ...base, leadId: lead.id, externalId: "MSG-1" });

    const again = await model.insertIfNew({
      ...base,
      text: "reentrega",
      leadId: lead.id,
      externalId: "MSG-1",
    });

    expect(again).toBeNull();
    expect(await model.listByLead(lead.id)).toHaveLength(1);
    expect((await model.findByExternalId("MSG-1"))?.text).toBe("Olá");
  });

  it("registra quem respondeu pelo portal", async () => {
    const lead = await createLead(testDb.db);
    const gestor = await createUser(testDb.db, { role: "GESTOR" });

    const message = await messageModel(testDb.db).insertIfNew({
      ...base,
      direction: "ENVIADA",
      leadId: lead.id,
      externalId: "MSG-2",
      sentBy: gestor.id,
    });

    expect(message?.sentBy).toBe(gestor.id);
  });
});

describe("messageModel.listByLead", () => {
  it("devolve só as mensagens do lead, em ordem cronológica", async () => {
    const lead = await createLead(testDb.db);
    const other = await createLead(testDb.db);
    const model = messageModel(testDb.db);
    const at = (minute: number) => new Date(`2026-11-17T12:${String(minute).padStart(2, "0")}:00Z`);
    await model.insertIfNew({ ...base, leadId: lead.id, externalId: "B", text: "segunda", sentAt: at(5) });
    await model.insertIfNew({ ...base, leadId: lead.id, externalId: "A", text: "primeira", sentAt: at(1) });
    await model.insertIfNew({ ...base, leadId: other.id, externalId: "C", text: "de outro", sentAt: at(3) });

    const texts = (await model.listByLead(lead.id)).map((message) => message.text);

    expect(texts).toEqual(["primeira", "segunda"]);
  });
});
