import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, createUser } from "../../../tests/factories";
import { createFakeEvolution } from "../../../tests/fake-evolution";
import { createFakeQualifier } from "../../../tests/fake-qualifier";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import type { NewLead } from "../db/schema";
import type { QualifierTurn } from "../integrations/anthropic/qualifier";
import { QualifierError } from "../integrations/anthropic/qualifier";
import { leadModel } from "../models/lead.model";
import { messageModel } from "../models/message.model";
import { createConversationService } from "./conversation.service";
import { createQualificationService, handoffText, summarize } from "./qualification.service";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const NOW = new Date("2026-11-18T15:00:00Z");
const APP_URL = "https://portal.exemplo.com";

function setup(script: Partial<QualifierTurn>[] = [], { withAi = true } = {}) {
  const evolution = createFakeEvolution();
  const fake = createFakeQualifier(script);
  const service = createQualificationService({
    db: testDb.db,
    evolution: evolution.client,
    qualifier: withAi ? fake.qualifier : null,
    appUrl: APP_URL,
    now: () => NOW,
  });
  const conversations = createConversationService({ db: testDb.db, evolution: evolution.client });
  return { service, conversations, evolution: evolution.state, ai: fake.state };
}

let sequence = 0;
/** Grava uma mensagem do lead e devolve o id, como o webhook faria. */
async function inbound(leadId: string, text: string, minute = sequence) {
  sequence += 1;
  const message = await messageModel(testDb.db).insertIfNew({
    leadId,
    direction: "RECEBIDA",
    type: "TEXTO",
    text,
    externalId: `IN-${sequence}`,
    sentAt: new Date(`2026-11-18T14:${String(minute % 60).padStart(2, "0")}:00Z`),
  });
  return message!.id;
}

async function newLead(overrides: Partial<NewLead> = {}) {
  return createLead(testDb.db, {
    name: "Maria Silva",
    phone: "5511987654321",
    whatsappJid: "5511987654321@s.whatsapp.net",
    stage: "QUALIFICANDO",
    ...overrides,
  });
}

const reload = async (id: string) => (await leadModel(testDb.db).findById(id))!;

describe("qualificationService.handleInbound — conversa", () => {
  it("responde o lead com a pergunta da IA e grava a mensagem como da IA", async () => {
    const { service, evolution, ai } = setup([
      { reply: "Oi, Maria! Você quer comprar ou alugar?", collected: { tipoImovel: "casa" } },
    ]);
    const lead = await newLead();
    const messageId = await inbound(lead.id, "Oi, quero uma casa");

    expect(await service.handleInbound(lead.id, messageId)).toBe("replied");

    expect(ai.calls[0]).toMatchObject({
      leadName: "Maria Silva",
      collected: {},
      history: [{ direction: "RECEBIDA", text: "Oi, quero uma casa" }],
    });
    expect(evolution.sent).toEqual([
      { to: "5511987654321@s.whatsapp.net", text: "Oi, Maria! Você quer comprar ou alugar?" },
    ]);
    const messages = await messageModel(testDb.db).listByLead(lead.id);
    expect(messages.find((m) => m.direction === "ENVIADA")).toMatchObject({
      direction: "ENVIADA",
      sentByBot: true,
      externalId: "SENT-1",
      sentBy: null,
    });
    expect(await reload(lead.id)).toMatchObject({
      stage: "QUALIFICANDO",
      qualification: { tipoImovel: "casa" },
    });
  });

  it("o eco da resposta da IA que volta pelo webhook é tratado como duplicata", async () => {
    const { service, conversations } = setup([{ reply: "Qual região?" }]);
    const lead = await newLead();
    await service.handleInbound(lead.id, await inbound(lead.id, "oi"));

    const echo = await conversations.receive({
      externalId: "SENT-1",
      jid: lead.whatsappJid,
      phone: lead.phone,
      pushName: null,
      fromMe: true,
      type: "TEXTO",
      text: "Qual região?",
      sentAt: NOW,
    });

    expect(echo.status).toBe("duplicate");
  });

  it("numa rajada de mensagens, só a mais recente é respondida", async () => {
    const { service, evolution, ai } = setup([{ reply: "Em qual região?" }, { reply: "nunca usada" }]);
    const lead = await newLead();
    const first = await inbound(lead.id, "oi", 1);
    const second = await inbound(lead.id, "quero comprar uma casa", 2);

    const outcomes = await Promise.all([
      service.handleInbound(lead.id, first),
      service.handleInbound(lead.id, second),
    ]);

    expect(outcomes.sort()).toEqual(["replied", "skipped"]);
    expect(evolution.sent).toHaveLength(1);
    expect(ai.calls[0].history.map((m) => m.text)).toEqual(["oi", "quero comprar uma casa"]);
  });

  it("não responde leads fora da qualificação (já distribuídos, com humano ou antigos)", async () => {
    const { service, evolution, ai } = setup([{ reply: "x" }]);
    for (const stage of ["HUMANO", "DISTRIBUIDO", "AGUARDANDO_VENDEDOR"] as const) {
      const lead = await createLead(testDb.db, { stage });
      expect(await service.handleInbound(lead.id, await inbound(lead.id, "oi"))).toBe("skipped");
    }
    expect(evolution.sent).toEqual([]);
    expect(ai.calls).toEqual([]);
  });

  it("depois que um colaborador responde pelo portal, a IA não fala mais", async () => {
    const { service, conversations, evolution } = setup([{ reply: "Qual região?" }]);
    const lead = await newLead();
    const gestor = await createUser(testDb.db, { role: "GESTOR" });
    await conversations.reply(lead.id, "Oi Maria, aqui é a Ana!", gestor);

    expect(await service.handleInbound(lead.id, await inbound(lead.id, "oi Ana"))).toBe("skipped");
    expect(evolution.sent).toHaveLength(1);
  });
});

describe("qualificationService — passagem para o vendedor", () => {
  const done: Partial<QualifierTurn> = {
    reply: "Perfeito, obrigada pelas informações!",
    collected: { objetivo: "comprar", tipoImovel: "apartamento 2 quartos", regiao: "Moema" },
    done: true,
    summary: "Quer comprar apto de 2 quartos em Moema, financiado, em até 3 meses.",
  };

  it("distribui para o próximo vendedor do rodízio, avisa o lead com o nome e o vendedor com o resumo", async () => {
    await createUser(testDb.db, { name: "Recente", lastAssignedAt: new Date("2026-11-18T10:00:00Z") });
    const vendedor = await createUser(testDb.db, {
      name: "Carlos Pereira",
      phone: "5511911112222",
      lastAssignedAt: new Date("2026-11-17T10:00:00Z"),
    });
    const { service, evolution } = setup([done]);
    const lead = await newLead();

    expect(await service.handleInbound(lead.id, await inbound(lead.id, "Moema, financiado"))).toBe(
      "handed_off",
    );

    expect(await reload(lead.id)).toMatchObject({
      stage: "DISTRIBUIDO",
      assignedTo: vendedor.id,
      assignedAt: NOW,
      qualificationSummary: done.summary,
      qualification: done.collected,
    });
    expect(evolution.sent[0]).toEqual({
      to: lead.whatsappJid,
      text: "Perfeito, obrigada pelas informações! O Carlos vai entrar em contato com você e te ajudar com o que precisa.",
    });
    expect(evolution.sent[1].to).toBe("5511911112222");
    expect(evolution.sent[1].text).toContain("Maria Silva");
    expect(evolution.sent[1].text).toContain("+5511987654321");
    expect(evolution.sent[1].text).toContain(done.summary);
    expect(evolution.sent[1].text).toContain(`${APP_URL}/leads/${lead.id}`);
  });

  it("leads seguidos vão para vendedores diferentes, pulando quem está fora da fila", async () => {
    const a = await createUser(testDb.db, { name: "Ana" });
    await createUser(testDb.db, { name: "Fora", inRotation: false });
    const b = await createUser(testDb.db, { name: "Bruno" });
    const { service } = setup([done, done, done]);

    const assigned: (string | null)[] = [];
    for (const n of [1, 2, 3]) {
      const lead = await newLead({ whatsappJid: `55119000000${n}@s.whatsapp.net` });
      await service.handleInbound(lead.id, await inbound(lead.id, "oi"));
      assigned.push((await reload(lead.id)).assignedTo);
    }

    expect(assigned).toEqual([a.id, b.id, a.id]);
  });

  it("sem vendedor na fila, o lead fica aguardando e recebe uma mensagem genérica", async () => {
    await createUser(testDb.db, { status: "INATIVO" });
    const { service, evolution } = setup([done]);
    const lead = await newLead();

    await service.handleInbound(lead.id, await inbound(lead.id, "oi"));

    expect(await reload(lead.id)).toMatchObject({ stage: "AGUARDANDO_VENDEDOR", assignedTo: null });
    expect(evolution.sent).toEqual([
      {
        to: lead.whatsappJid,
        text: "Perfeito, obrigada pelas informações! Um dos nossos corretores vai entrar em contato com você em breve.",
      },
    ]);
  });

  it("se a IA falha, o lead vai direto para o rodízio com o que já foi apurado", async () => {
    await createUser(testDb.db, { name: "Carlos" });
    const { service, evolution, ai } = setup();
    ai.failWith = new QualifierError("fora do ar");
    const lead = await newLead({ qualification: { regiao: "Moema" } });

    expect(await service.handleInbound(lead.id, await inbound(lead.id, "oi"))).toBe("handed_off");

    expect(await reload(lead.id)).toMatchObject({
      stage: "DISTRIBUIDO",
      qualificationSummary: "Região: Moema",
    });
    expect(evolution.sent[0].text).toBe(
      "O Carlos vai entrar em contato com você e te ajudar com o que precisa.",
    );
  });

  it("sem IA configurada, a primeira mensagem já vai para o rodízio", async () => {
    await createUser(testDb.db, { name: "Carlos" });
    const { service } = setup([], { withAi: false });
    const lead = await newLead();

    expect(await service.handleInbound(lead.id, await inbound(lead.id, "oi"))).toBe("handed_off");
    expect((await reload(lead.id)).stage).toBe("DISTRIBUIDO");
  });

  it("depois do limite de mensagens da IA, passa para o vendedor sem chamar a IA", async () => {
    await createUser(testDb.db, { name: "Carlos" });
    const { service, ai } = setup();
    const lead = await newLead();
    for (let i = 0; i < 6; i++) {
      await messageModel(testDb.db).insertIfNew({
        leadId: lead.id,
        direction: "ENVIADA",
        type: "TEXTO",
        text: `pergunta ${i}`,
        externalId: `BOT-${i}`,
        sentByBot: true,
        sentAt: new Date("2026-11-18T13:00:00Z"),
      });
    }

    expect(await service.handleInbound(lead.id, await inbound(lead.id, "ok"))).toBe("handed_off");
    expect(ai.calls).toEqual([]);
  });

  it("falha ao avisar o vendedor não desfaz a distribuição", async () => {
    const vendedor = await createUser(testDb.db, { name: "Carlos", phone: "5511911112222" });
    const { service, evolution } = setup([done]);
    const lead = await newLead();
    evolution.failSendTo = "5511911112222";

    expect(await service.handleInbound(lead.id, await inbound(lead.id, "oi"))).toBe("handed_off");
    expect((await reload(lead.id)).assignedTo).toBe(vendedor.id);
  });
});

describe("textos", () => {
  it("mensagem final usa só o primeiro nome do vendedor", () => {
    expect(handoffText({ name: "  Carlos Alberto Pereira " })).toBe(
      "O Carlos vai entrar em contato com você e te ajudar com o que precisa.",
    );
  });

  it("resumo de reserva lista os campos apurados", () => {
    expect(summarize({ objetivo: "alugar", prazo: "imediato", regiao: null })).toBe(
      "Objetivo: alugar\nPrazo: imediato",
    );
    expect(summarize({})).toBe("Lead não respondeu à qualificação.");
  });
});
