import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, createUser } from "../../../tests/factories";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { leadModel } from "../models/lead.model";
import { createFunnelService } from "./funnel.service";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const NOW = new Date("2026-11-20T09:00:00Z");
const setup = () => createFunnelService({ db: testDb.db, now: () => NOW });
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("funnelService.changeStage", () => {
  it("lead novo começa em Qualificação com a IA ativa", async () => {
    const lead = await createLead(testDb.db);

    expect(lead).toMatchObject({ stage: "QUALIFICANDO", automationPaused: false });
  });

  it("sair da Qualificação pausa a IA e voltar não religa", async () => {
    const funnel = setup();
    const lead = await createLead(testDb.db);

    const moved = await funnel.changeStage(lead.id, { stage: "HUMANO" });
    expect(moved).toMatchObject({
      stage: "HUMANO",
      automationPaused: true,
      stageChangedAt: NOW,
    });

    const back = await funnel.changeStage(lead.id, { stage: "QUALIFICANDO" });
    expect(back).toMatchObject({ stage: "QUALIFICANDO", automationPaused: true });
  });

  it("guarda os dados do Ganho", async () => {
    const lead = await createLead(testDb.db);

    const won = await setup().changeStage(lead.id, {
      stage: "GANHO",
      wonType: "COMPRA",
      wonValue: 450000.5,
      wonConditions: "Financiamento Caixa, entrada de 20%",
    });

    expect(won).toMatchObject({
      stage: "GANHO",
      automationPaused: true,
      wonType: "COMPRA",
      wonValue: "450000.50",
      wonConditions: "Financiamento Caixa, entrada de 20%",
      lostReason: null,
    });
  });

  it("guarda o motivo do Perdido e limpa ao reabrir", async () => {
    const funnel = setup();
    const lead = await createLead(testDb.db);
    await funnel.changeStage(lead.id, {
      stage: "GANHO", wonType: "ALUGUEL", wonValue: 3000, wonConditions: null,
    });

    const lost = await funnel.changeStage(lead.id, {
      stage: "PERDIDO", lostReason: "PRECO", lostNote: "Achou caro",
    });
    expect(lost).toMatchObject({
      lostReason: "PRECO", lostNote: "Achou caro", wonType: null, wonValue: null,
    });

    const reopened = await funnel.changeStage(lead.id, { stage: "HUMANO" });
    expect(reopened).toMatchObject({
      stage: "HUMANO", lostReason: null, lostNote: null, automationPaused: true,
    });
  });

  it("falha para lead inexistente", async () => {
    await expect(setup().changeStage(MISSING_ID, { stage: "PARADO" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("funnelService.setAutomation", () => {
  it("pausa e retoma na Qualificação", async () => {
    const funnel = setup();
    const lead = await createLead(testDb.db);

    expect(await funnel.setAutomation(lead.id, true)).toMatchObject({ automationPaused: true });
    expect(await funnel.setAutomation(lead.id, false)).toMatchObject({ automationPaused: false });
  });

  it("não retoma fora da Qualificação", async () => {
    const funnel = setup();
    const lead = await createLead(testDb.db);
    await funnel.changeStage(lead.id, { stage: "PARADO" });

    await expect(funnel.setAutomation(lead.id, false)).rejects.toMatchObject({
      status: 409,
      code: "AUTOMATION_OUTSIDE_QUALIFICATION",
    });
  });
});

describe("tarefas", () => {
  it("cria, lista abertas por data, conclui e exclui", async () => {
    const funnel = setup();
    const actor = await createUser(testDb.db, { role: "GESTOR" });
    const lead = await createLead(testDb.db);

    const later = await funnel.createTask(lead.id, { title: "Enviar contrato", dueDate: "2026-11-25" }, actor);
    const sooner = await funnel.createTask(lead.id, { title: "Ligar", dueDate: "2026-11-21" }, actor);

    expect((await funnel.listTasks(lead.id)).map((t) => t.title)).toEqual(["Ligar", "Enviar contrato"]);

    const done = await funnel.setTaskDone(lead.id, sooner.id, true);
    expect(done.doneAt).toEqual(NOW);
    expect((await funnel.listTasks(lead.id)).map((t) => t.title)).toEqual(["Enviar contrato", "Ligar"]);
    expect((await funnel.setTaskDone(lead.id, sooner.id, false)).doneAt).toBeNull();

    await funnel.deleteTask(lead.id, later.id);
    expect(await funnel.listTasks(lead.id)).toHaveLength(1);
  });

  it("a lista de leads traz o vencimento da próxima tarefa aberta", async () => {
    const funnel = setup();
    const actor = await createUser(testDb.db, { role: "GESTOR" });
    const lead = await createLead(testDb.db);
    await createLead(testDb.db, { lastMessageAt: new Date("2026-01-01T00:00:00Z") });
    const first = await funnel.createTask(lead.id, { title: "A", dueDate: "2026-11-21" }, actor);
    await funnel.createTask(lead.id, { title: "B", dueDate: "2026-11-23" }, actor);
    await funnel.setTaskDone(lead.id, first.id, true);

    const [withTask, without] = await leadModel(testDb.db).list();

    expect(withTask.nextTaskDue).toBe("2026-11-23");
    expect(without.nextTaskDue).toBeNull();
  });

  it("não mexe em tarefa de outro lead", async () => {
    const funnel = setup();
    const actor = await createUser(testDb.db, { role: "GESTOR" });
    const lead = await createLead(testDb.db);
    const other = await createLead(testDb.db);
    const task = await funnel.createTask(lead.id, { title: "A", dueDate: "2026-11-21" }, actor);

    await expect(funnel.setTaskDone(other.id, task.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(funnel.deleteTask(other.id, task.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      funnel.createTask(MISSING_ID, { title: "A", dueDate: "2026-11-21" }, actor),
    ).rejects.toMatchObject({ status: 404 });
  });
});
