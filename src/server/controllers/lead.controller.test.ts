import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, routeParams } from "../../../tests/app";
import { createLead, createUser } from "../../../tests/factories";
import { apiRequest } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { AppError } from "../http/errors";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

async function setup(
  role: "GESTOR" | "VENDEDOR" = "GESTOR",
  options: { whatsappConfigured?: boolean } = {},
) {
  const app = createTestApp(testDb.db, undefined, options);
  const actor = await createUser(testDb.db, { role });
  const { token } = await app.services.auth.createSession(actor.id);
  return { ...app, actor, session: token };
}

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("GET /api/leads", () => {
  it("lista os leads do mais recente para o mais antigo", async () => {
    const { controllers, session } = await setup();
    await createLead(testDb.db, { name: "Antigo", lastMessageAt: new Date("2026-11-01T10:00:00Z") });
    await createLead(testDb.db, {
      name: "Recente",
      phone: "351912345678",
      lastMessageAt: new Date("2026-11-17T10:00:00Z"),
      lastMessageText: "Ainda está disponível?",
    });

    const response = await controllers.lead.list(apiRequest("GET", "/api/leads", { session }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leads.map((lead: { name: string }) => lead.name)).toEqual(["Recente", "Antigo"]);
    expect(body.leads[0]).toEqual({
      id: expect.any(String),
      name: "Recente",
      phone: "351912345678",
      lastMessageAt: "2026-11-17T10:00:00.000Z",
      lastMessageText: "Ainda está disponível?",
      stage: "QUALIFICANDO",
      seller: null,
      assignedAt: null,
      qualification: null,
      qualificationSummary: null,
      automationPaused: false,
      stageChangedAt: expect.any(String),
      won: null,
      lost: null,
      nextTaskDue: null,
    });
  });

  it("responde 401 sem sessão e 403 para vendedor", async () => {
    const { controllers, session } = await setup("VENDEDOR");

    const anonymous = await controllers.lead.list(apiRequest("GET", "/api/leads"));
    const seller = await controllers.lead.list(apiRequest("GET", "/api/leads", { session }));

    expect(anonymous.status).toBe(401);
    expect(seller.status).toBe(403);
  });
});

describe("GET /api/leads/[id]", () => {
  it("devolve o lead com a conversa em ordem", async () => {
    const { controllers, services, session } = await setup();
    const lead = await createLead(testDb.db, { whatsappJid: "351912345678@s.whatsapp.net" });
    const base = {
      jid: "351912345678@s.whatsapp.net",
      phone: "351912345678",
      pushName: "Maria",
      type: "TEXTO" as const,
    };
    await services.conversations.receive({
      ...base, externalId: "A", fromMe: false, text: "Olá", sentAt: new Date("2026-11-17T12:00:00Z"),
    });
    await services.conversations.receive({
      ...base, externalId: "B", fromMe: true, pushName: null, text: "Bom dia!", sentAt: new Date("2026-11-17T12:01:00Z"),
    });

    const response = await controllers.lead.show(
      apiRequest("GET", `/api/leads/${lead.id}`, { session }),
      routeParams({ id: lead.id }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lead.id).toBe(lead.id);
    expect(body.messages).toEqual([
      { id: expect.any(String), direction: "RECEBIDA", type: "TEXTO", text: "Olá", sentByBot: false, sentAt: "2026-11-17T12:00:00.000Z" },
      { id: expect.any(String), direction: "ENVIADA", type: "TEXTO", text: "Bom dia!", sentByBot: false, sentAt: "2026-11-17T12:01:00.000Z" },
    ]);
  });

  it("responde 404 para id inexistente ou malformado", async () => {
    const { controllers, session } = await setup();

    for (const id of [MISSING_ID, "nao-e-uuid"]) {
      const response = await controllers.lead.show(
        apiRequest("GET", `/api/leads/${id}`, { session }),
        routeParams({ id }),
      );
      expect(response.status).toBe(404);
    }
  });

  it("responde 403 para vendedor", async () => {
    const { controllers, session } = await setup("VENDEDOR");
    const lead = await createLead(testDb.db);

    const response = await controllers.lead.show(
      apiRequest("GET", `/api/leads/${lead.id}`, { session }),
      routeParams({ id: lead.id }),
    );

    expect(response.status).toBe(403);
  });
});

describe("POST /api/leads/[id]/mensagens", () => {
  const reply = (
    app: Awaited<ReturnType<typeof setup>>,
    leadId: string,
    body: unknown,
  ) =>
    app.controllers.lead.reply(
      apiRequest("POST", `/api/leads/${leadId}/mensagens`, { session: app.session, body }),
      routeParams({ id: leadId }),
    );

  it("envia a resposta pelo WhatsApp e devolve a mensagem gravada", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db, { whatsappJid: "351912345678@s.whatsapp.net" });

    const response = await reply(app, lead.id, { text: "  Bom dia! Posso ajudar?  " });

    expect(response.status).toBe(201);
    expect((await response.json()).message).toMatchObject({
      direction: "ENVIADA",
      text: "Bom dia! Posso ajudar?",
    });
    expect(app.evolution.sent).toEqual([
      { to: "351912345678@s.whatsapp.net", text: "Bom dia! Posso ajudar?" },
    ]);
  });

  it("responde 400 para texto vazio, sem enviar", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);

    const response = await reply(app, lead.id, { text: "   " });

    expect(response.status).toBe(400);
    expect((await response.json()).error.fields.text).toBeDefined();
    expect(app.evolution.sent).toEqual([]);
  });

  it("repassa a falha do WhatsApp e não grava a mensagem", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);
    app.evolution.failWith = new AppError(
      502,
      "WHATSAPP_UNAVAILABLE",
      "Não foi possível falar com o WhatsApp agora. Tente novamente.",
    );

    const response = await reply(app, lead.id, { text: "Oi" });

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("WHATSAPP_UNAVAILABLE");
    expect((await app.services.conversations.getConversation(lead.id)).messages).toEqual([]);
  });

  it("responde 503 quando o WhatsApp não está configurado", async () => {
    const app = await setup("GESTOR", { whatsappConfigured: false });
    const lead = await createLead(testDb.db);

    const response = await reply(app, lead.id, { text: "Oi" });

    expect(response.status).toBe(503);
  });

  it("responde 404 para lead inexistente e 403 para vendedor", async () => {
    const gestor = await setup();
    expect((await reply(gestor, MISSING_ID, { text: "Oi" })).status).toBe(404);

    const vendedor = await setup("VENDEDOR");
    const lead = await createLead(testDb.db);
    expect((await reply(vendedor, lead.id, { text: "Oi" })).status).toBe(403);
    expect(vendedor.evolution.sent).toEqual([]);
  });
});

describe("GET /api/leads — rodízio", () => {
  it("mostra a etapa, o vendedor e o resumo da qualificação", async () => {
    const { controllers, session } = await setup();
    const vendedor = await createUser(testDb.db, { name: "Carlos Pereira" });
    await createLead(testDb.db, {
      stage: "DISTRIBUIDO",
      assignedTo: vendedor.id,
      assignedAt: new Date("2026-11-18T15:00:00Z"),
      qualification: { objetivo: "comprar" },
      qualificationSummary: "Quer comprar",
    });

    const body = await (await controllers.lead.list(apiRequest("GET", "/api/leads", { session }))).json();

    expect(body.leads[0]).toMatchObject({
      stage: "DISTRIBUIDO",
      seller: { id: vendedor.id, name: "Carlos Pereira" },
      assignedAt: "2026-11-18T15:00:00.000Z",
      qualification: { objetivo: "comprar" },
      qualificationSummary: "Quer comprar",
    });
  });
});

describe("funil do lead", () => {
  type App = Awaited<ReturnType<typeof setup>>;
  const call = (
    app: App,
    action: "changeStage" | "setAutomation" | "createTask",
    leadId: string,
    body: unknown,
  ) =>
    app.controllers.lead[action](
      apiRequest("PATCH", `/api/leads/${leadId}`, { session: app.session, body }),
      routeParams({ id: leadId }),
    );

  it("PATCH etapa marca Ganho com os dados e pausa a IA", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);

    const response = await call(app, "changeStage", lead.id, {
      stage: "GANHO", wonType: "COMPRA", wonValue: 350000, wonConditions: " À vista ",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).lead).toMatchObject({
      stage: "GANHO",
      automationPaused: true,
      won: { type: "COMPRA", value: 350000, conditions: "À vista" },
      lost: null,
    });
  });

  it("PATCH etapa valida Ganho e Perdido", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);

    const won = await call(app, "changeStage", lead.id, { stage: "GANHO", wonType: "COMPRA" });
    const lost = await call(app, "changeStage", lead.id, { stage: "PERDIDO", lostReason: "OUTRO" });
    const invalid = await call(app, "changeStage", lead.id, { stage: "XYZ" });

    expect(won.status).toBe(400);
    expect((await won.json()).error.fields.wonValue).toBeDefined();
    expect(lost.status).toBe(400);
    expect((await lost.json()).error.fields.lostNote).toBe("Descreva o motivo.");
    expect(invalid.status).toBe(400);
  });

  it("PATCH automacao pausa e recusa retomar fora da Qualificação", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);

    const paused = await call(app, "setAutomation", lead.id, { paused: true });
    expect((await paused.json()).lead.automationPaused).toBe(true);

    await call(app, "changeStage", lead.id, { stage: "PARADO" });
    const resume = await call(app, "setAutomation", lead.id, { paused: false });
    expect(resume.status).toBe(409);
  });

  it("tarefas: cria, aparece na conversa, conclui e exclui", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);

    const created = await call(app, "createTask", lead.id, { title: "Ligar", dueDate: "2026-11-25" });
    expect(created.status).toBe(201);
    const { task } = await created.json();
    expect(task).toEqual({ id: expect.any(String), title: "Ligar", dueDate: "2026-11-25", done: false });

    const show = await app.controllers.lead.show(
      apiRequest("GET", `/api/leads/${lead.id}`, { session: app.session }),
      routeParams({ id: lead.id }),
    );
    expect((await show.json()).tasks).toEqual([task]);

    const ids = routeParams({ id: lead.id, tarefaId: task.id });
    const path = `/api/leads/${lead.id}/tarefas/${task.id}`;
    const done = await app.controllers.lead.updateTask(
      apiRequest("PATCH", path, { session: app.session, body: { done: true } }),
      ids,
    );
    expect((await done.json()).task.done).toBe(true);

    const removed = await app.controllers.lead.deleteTask(
      apiRequest("DELETE", path, { session: app.session }),
      ids,
    );
    expect(removed.status).toBe(204);
    const again = await app.controllers.lead.deleteTask(
      apiRequest("DELETE", path, { session: app.session }),
      ids,
    );
    expect(again.status).toBe(404);
  });

  it("tarefa exige título e data; lead inexistente dá 404; vendedor 403", async () => {
    const app = await setup();
    const lead = await createLead(testDb.db);

    const invalid = await call(app, "createTask", lead.id, { title: " ", dueDate: "amanhã" });
    expect(invalid.status).toBe(400);
    expect(Object.keys((await invalid.json()).error.fields)).toEqual(["title", "dueDate"]);
    expect(
      (await call(app, "createTask", MISSING_ID, { title: "A", dueDate: "2026-11-25" })).status,
    ).toBe(404);

    const seller = await setup("VENDEDOR");
    expect((await call(seller, "changeStage", lead.id, { stage: "PARADO" })).status).toBe(403);
    expect((await call(seller, "setAutomation", lead.id, { paused: true })).status).toBe(403);
  });
});
