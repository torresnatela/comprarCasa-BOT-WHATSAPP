import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createLeadQualifier,
  DEFAULT_QUALIFIER_MODEL,
  QualifierError,
  toApiMessages,
} from "./qualifier";

const recebida = (text: string) => ({ direction: "RECEBIDA" as const, text });
const enviada = (text: string) => ({ direction: "ENVIADA" as const, text });

describe("toApiMessages", () => {
  it("mapeia lead para user e imobiliária para assistant, juntando mensagens seguidas", () => {
    expect(
      toApiMessages([
        recebida("oi"),
        recebida("quero comprar uma casa"),
        enviada("Olá! Em qual região?"),
        recebida("Moema"),
      ]),
    ).toEqual([
      { role: "user", content: "oi\nquero comprar uma casa" },
      { role: "assistant", content: "Olá! Em qual região?" },
      { role: "user", content: "Moema" },
    ]);
  });

  it("começa e termina sempre com o lead e ignora textos vazios", () => {
    expect(
      toApiMessages([enviada("Mensagem antiga da equipe"), recebida("oi"), recebida("  "), enviada("Olá!")]),
    ).toEqual([{ role: "user", content: "oi" }]);
  });
});

const turn = {
  reply: "Olá, Maria! Você quer comprar ou alugar?",
  collected: {
    objetivo: null,
    tipoImovel: "casa",
    regiao: null,
    faixaValor: null,
    pagamento: null,
    prazo: null,
    observacoes: null,
  },
  done: false,
  summary: null,
};

function apiMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: DEFAULT_QUALIFIER_MODEL,
    content: [{ type: "text", text: JSON.stringify(turn) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    ...overrides,
  };
}

function setup(reply: { status?: number; body: unknown }) {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    void _url;
    void init;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  const client = new Anthropic({
    apiKey: "chave-de-teste",
    maxRetries: 0,
    fetch: fetchMock as unknown as typeof fetch,
  });
  const qualifier = createLeadQualifier({ client });
  const sentBody = () => JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
  return { qualifier, sentBody };
}

const input = {
  leadName: "Maria Silva",
  history: [recebida("Oi, quero uma casa")],
  collected: { tipoImovel: "casa" },
};

describe("createLeadQualifier", () => {
  it("chama o Haiku com saída estruturada, esforço baixo e o contexto do lead", async () => {
    const { qualifier, sentBody } = setup({ body: apiMessage() });

    const result = await qualifier.nextTurn(input);

    expect(result).toEqual({ ...turn, summary: null });
    const body = sentBody();
    expect(body).toMatchObject({
      model: "claude-haiku-5-5",
      output_config: { effort: "low", format: { type: "json_schema" } },
      messages: [{ role: "user", content: "Oi, quero uma casa" }],
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body.system[1].text).toContain("Maria Silva");
    expect(body.system[1].text).toContain('"tipoImovel":"casa"');
  });

  it("transforma recusa, resposta inválida e erro da API em QualifierError", async () => {
    const refusal = setup({ body: apiMessage({ stop_reason: "refusal", content: [] }) });
    await expect(refusal.qualifier.nextTurn(input)).rejects.toBeInstanceOf(QualifierError);

    const truncated = setup({
      body: apiMessage({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"reply":' }] }),
    });
    await expect(truncated.qualifier.nextTurn(input)).rejects.toBeInstanceOf(QualifierError);

    const failure = setup({
      status: 500,
      body: { type: "error", error: { type: "api_error", message: "boom" } },
    });
    await expect(failure.qualifier.nextTurn(input)).rejects.toBeInstanceOf(QualifierError);
  });

  it("não chama a API quando o lead ainda não disse nada", async () => {
    const { qualifier } = setup({ body: apiMessage() });

    await expect(
      qualifier.nextTurn({ ...input, history: [enviada("Olá")] }),
    ).rejects.toBeInstanceOf(QualifierError);
  });
});
