import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, createUser } from "../../../tests/factories";
import { createFakeEvolution } from "../../../tests/fake-evolution";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { AppError, NotFoundError } from "../http/errors";
import type { IncomingMessage } from "../integrations/evolution/webhook-payload";
import { createConversationService } from "./conversation.service";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

function setup(configured = true) {
  const evolution = createFakeEvolution();
  const service = createConversationService({
    db: testDb.db,
    evolution: configured ? evolution.client : null,
  });
  return { service, evolution: evolution.state };
}

const incoming = (overrides: Partial<IncomingMessage> = {}): IncomingMessage => ({
  externalId: "MSG-1",
  jid: "351912345678@s.whatsapp.net",
  phone: "351912345678",
  pushName: "Maria Silva",
  fromMe: false,
  type: "TEXTO",
  text: "Olá, tenho interesse no T2",
  sentAt: new Date("2026-11-17T12:00:00Z"),
  ...overrides,
});

describe("conversationService.receive", () => {
  it("cria o lead na primeira mensagem de um contato", async () => {
    const { service } = setup();

    const result = await service.receive(incoming());

    expect(result).toMatchObject({
      status: "stored",
      isNewLead: true,
      lead: {
        whatsappJid: "351912345678@s.whatsapp.net",
        phone: "351912345678",
        name: "Maria Silva",
        lastMessageText: "Olá, tenho interesse no T2",
      },
      message: { direction: "RECEBIDA", type: "TEXTO", externalId: "MSG-1" },
    });
  });

  it("anexa as mensagens seguintes à mesma conversa", async () => {
    const { service } = setup();
    const first = await service.receive(incoming());
    if (first.status !== "stored") throw new Error("esperava gravar");

    const second = await service.receive(
      incoming({
        externalId: "MSG-2",
        text: "Ainda está disponível?",
        sentAt: new Date("2026-11-17T12:05:00Z"),
      }),
    );

    expect(second).toMatchObject({ status: "stored", isNewLead: false });
    const conversation = await service.getConversation(first.lead.id);
    expect(conversation.messages.map((m) => m.text)).toEqual([
      "Olá, tenho interesse no T2",
      "Ainda está disponível?",
    ]);
    expect(conversation.lead.lastMessageText).toBe("Ainda está disponível?");
    expect(await service.listLeads()).toHaveLength(1);
  });

  it("ignora a reentrega da mesma mensagem", async () => {
    const { service } = setup();
    const first = await service.receive(incoming());
    if (first.status !== "stored") throw new Error("esperava gravar");

    const again = await service.receive(incoming({ text: "texto alterado" }));

    expect(again).toEqual({ status: "duplicate" });
    expect((await service.getConversation(first.lead.id)).messages).toHaveLength(1);
  });

  it("registra como ENVIADA o que a imobiliária digita no celular para um lead", async () => {
    const { service } = setup();
    await service.receive(incoming());

    const result = await service.receive(
      incoming({ externalId: "MSG-2", fromMe: true, pushName: null, text: "Bom dia, Maria!" }),
    );

    expect(result).toMatchObject({
      status: "stored",
      message: { direction: "ENVIADA", sentBy: null },
      lead: { name: "Maria Silva" },
    });
  });

  it("não cria lead a partir de mensagem enviada pela própria imobiliária", async () => {
    const { service } = setup();

    const result = await service.receive(incoming({ fromMe: true, pushName: null }));

    expect(result).toEqual({ status: "ignored" });
    expect(await service.listLeads()).toEqual([]);
  });
});

describe("conversationService.getConversation", () => {
  it("lança NotFoundError para lead inexistente", async () => {
    const { service } = setup();

    await expect(
      service.getConversation("00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("conversationService.reply", () => {
  it("envia pelo WhatsApp e grava a resposta com quem enviou", async () => {
    const { service, evolution } = setup();
    const lead = await createLead(testDb.db, { whatsappJid: "351912345678@s.whatsapp.net" });
    const gestor = await createUser(testDb.db, { role: "GESTOR" });

    const message = await service.reply(lead.id, "Bom dia! Posso ajudar?", gestor);

    expect(evolution.sent).toEqual([
      { to: "351912345678@s.whatsapp.net", text: "Bom dia! Posso ajudar?" },
    ]);
    expect(message).toMatchObject({
      direction: "ENVIADA",
      type: "TEXTO",
      text: "Bom dia! Posso ajudar?",
      externalId: "SENT-1",
      sentBy: gestor.id,
    });
    const conversation = await service.getConversation(lead.id);
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.lead.lastMessageText).toBe("Bom dia! Posso ajudar?");
  });

  it("não grava nada quando o WhatsApp falha", async () => {
    const { service, evolution } = setup();
    const lead = await createLead(testDb.db);
    const gestor = await createUser(testDb.db, { role: "GESTOR" });
    evolution.failWith = new AppError(502, "WHATSAPP_UNAVAILABLE", "fora do ar");

    await expect(service.reply(lead.id, "Oi", gestor)).rejects.toMatchObject({
      code: "WHATSAPP_UNAVAILABLE",
    });
    expect((await service.getConversation(lead.id)).messages).toEqual([]);
  });

  it("não duplica quando o webhook entrega o eco antes da gravação", async () => {
    const { service } = setup();
    const lead = await createLead(testDb.db, { whatsappJid: "351912345678@s.whatsapp.net" });
    const gestor = await createUser(testDb.db, { role: "GESTOR" });
    await service.receive(
      incoming({ externalId: "SENT-1", fromMe: true, pushName: null, text: "Oi" }),
    );

    const message = await service.reply(lead.id, "Oi", gestor);

    expect(message.externalId).toBe("SENT-1");
    expect((await service.getConversation(lead.id)).messages).toHaveLength(1);
  });

  it("recusa lead inexistente sem enviar nada", async () => {
    const { service, evolution } = setup();
    const gestor = await createUser(testDb.db, { role: "GESTOR" });

    await expect(
      service.reply("00000000-0000-4000-8000-000000000000", "Oi", gestor),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(evolution.sent).toEqual([]);
  });

  it("avisa quando o WhatsApp não está configurado", async () => {
    const { service } = setup(false);
    const lead = await createLead(testDb.db);
    const gestor = await createUser(testDb.db, { role: "GESTOR" });

    await expect(service.reply(lead.id, "Oi", gestor)).rejects.toMatchObject({
      status: 503,
      code: "WHATSAPP_NOT_CONFIGURED",
    });
  });
});

describe("conversationService.reply — IA de qualificação", () => {
  it("colaborador respondendo tira o lead da qualificação por IA", async () => {
    const { service } = setup();
    const emQualificacao = await createLead(testDb.db, { stage: "QUALIFICANDO" });
    const distribuido = await createLead(testDb.db, { stage: "DISTRIBUIDO" });
    const gestor = await createUser(testDb.db, { role: "GESTOR" });

    await service.reply(emQualificacao.id, "Oi, aqui é a Ana", gestor);
    await service.reply(distribuido.id, "Oi", gestor);

    expect((await service.getConversation(emQualificacao.id)).lead.stage).toBe("HUMANO");
    expect((await service.getConversation(distribuido.id)).lead.stage).toBe("DISTRIBUIDO");
  });
});
