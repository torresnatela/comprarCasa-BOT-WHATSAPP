import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, WEBHOOK_SECRET } from "../../../tests/app";
import { upsertPayload } from "../../../tests/evolution-fixtures";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { WEBHOOK_SECRET_HEADER } from "../integrations/evolution/client";
import { leadModel } from "../models/lead.model";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

/** Requisição como a Evolution faz: servidor a servidor, sem Origin nem cookie. */
function webhookRequest(body: unknown, secret: string | null = WEBHOOK_SECRET) {
  return new Request("https://portal.exemplo.com/api/webhooks/evolution", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret !== null && { [WEBHOOK_SECRET_HEADER]: secret }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/webhooks/evolution", () => {
  it("grava a mensagem e cria o lead", async () => {
    const { controllers } = createTestApp(testDb.db);

    const response = await controllers.webhook.receive(webhookRequest(upsertPayload()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "stored" });
    const [lead] = await leadModel(testDb.db).list();
    expect(lead).toMatchObject({
      name: "Maria Silva",
      phone: "351912345678",
      lastMessageText: "Olá, vi o anúncio do T2 em Caldas",
    });
  });

  it("não duplica quando a Evolution reentrega a mesma mensagem", async () => {
    const { controllers, services } = createTestApp(testDb.db);
    await controllers.webhook.receive(webhookRequest(upsertPayload()));

    const again = await controllers.webhook.receive(webhookRequest(upsertPayload()));

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, result: "duplicate" });
    const [lead] = await leadModel(testDb.db).list();
    expect((await services.conversations.getConversation(lead.id)).messages).toHaveLength(1);
  });

  it.each([
    ["sem o cabeçalho do segredo", null],
    ["com segredo errado", "segredo-errado"],
    ["com segredo de outro tamanho", "x"],
  ])("responde 401 %s e não grava nada", async (_caso, secret) => {
    const { controllers } = createTestApp(testDb.db);

    const response = await controllers.webhook.receive(
      webhookRequest(upsertPayload(), secret),
    );

    expect(response.status).toBe(401);
    expect(await leadModel(testDb.db).list()).toEqual([]);
  });

  it("responde 200 e ignora mensagem de grupo (para a Evolution não reenviar)", async () => {
    const { controllers } = createTestApp(testDb.db);

    const response = await controllers.webhook.receive(
      webhookRequest(upsertPayload({ remoteJid: "120363025246125486@g.us" })),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "ignored" });
    expect(await leadModel(testDb.db).list()).toEqual([]);
  });

  it("ignora eventos de outra instância do mesmo servidor Evolution", async () => {
    const { controllers } = createTestApp(testDb.db);

    const response = await controllers.webhook.receive(
      webhookRequest(upsertPayload({ instance: "Outra Empresa" })),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "ignored" });
    expect(await leadModel(testDb.db).list()).toEqual([]);
  });

  it("responde 400 para corpo que não é JSON", async () => {
    const { controllers } = createTestApp(testDb.db);

    const response = await controllers.webhook.receive(webhookRequest("{quebrado"));

    expect(response.status).toBe(400);
  });

  it("responde 503 enquanto o segredo do webhook não está configurado", async () => {
    const { controllers } = createTestApp(testDb.db, undefined, {
      whatsappConfigured: false,
    });

    const response = await controllers.webhook.receive(webhookRequest(upsertPayload()));

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("WHATSAPP_NOT_CONFIGURED");
  });

  it("nunca devolve a chave que a Evolution manda dentro do payload", async () => {
    const { controllers } = createTestApp(testDb.db);

    const response = await controllers.webhook.receive(webhookRequest(upsertPayload()));

    expect(await response.text()).not.toContain("token-da-instancia");
  });
});

describe("POST /api/webhooks/evolution — qualificação por IA", () => {
  it("responde 200 antes da IA e a IA responde o lead novo depois", async () => {
    const { controllers, evolution, ai, settle } = createTestApp(testDb.db);
    ai.script.push({ reply: "Oi, Maria! Você procura para comprar ou alugar?" });

    const response = await controllers.webhook.receive(webhookRequest(upsertPayload()));

    expect(await response.json()).toEqual({ ok: true, result: "stored" });
    expect(evolution.sent).toEqual([]);
    await settle();
    expect(evolution.sent).toEqual([
      {
        to: "351912345678@s.whatsapp.net",
        text: "Oi, Maria! Você procura para comprar ou alugar?",
      },
    ]);
  });

  it("não agenda a IA para duplicatas, mensagens enviadas ou leads com humano", async () => {
    const { controllers, ai, settle } = createTestApp(testDb.db);
    ai.script.push({ reply: "primeira" });
    await controllers.webhook.receive(webhookRequest(upsertPayload()));
    await settle();

    await controllers.webhook.receive(webhookRequest(upsertPayload()));
    await controllers.webhook.receive(
      webhookRequest(upsertPayload({ id: "ENVIADA-1", fromMe: true, message: { conversation: "do celular" } })),
    );
    const [lead] = await leadModel(testDb.db).list();
    await leadModel(testDb.db).moveStage(lead.id, "QUALIFICANDO", "HUMANO");
    await controllers.webhook.receive(
      webhookRequest(upsertPayload({ id: "OUTRA-1", message: { conversation: "alguém aí?" } })),
    );
    await settle();

    expect(ai.calls).toHaveLength(1);
  });

  it("não agenda a IA quando o gestor a pausou", async () => {
    const { controllers, services, ai, settle } = createTestApp(testDb.db);
    ai.script.push({ reply: "primeira" });
    await controllers.webhook.receive(webhookRequest(upsertPayload()));
    await settle();
    const [lead] = await leadModel(testDb.db).list();
    await services.funnel.setAutomation(lead.id, true);

    await controllers.webhook.receive(
      webhookRequest(upsertPayload({ id: "OUTRA-1", message: { conversation: "alguém aí?" } })),
    );
    await settle();

    expect(ai.calls).toHaveLength(1);
  });
});
