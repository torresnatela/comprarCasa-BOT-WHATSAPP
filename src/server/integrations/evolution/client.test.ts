import { describe, expect, it, vi } from "vitest";
import { createEvolutionClient, WEBHOOK_SECRET_HEADER } from "./client";

type Reply = { status?: number; body?: unknown } | Error;

function setup(reply: Reply = { status: 200, body: {} }) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    if (reply instanceof Error) throw reply;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
    });
  });
  const client = createEvolutionClient({
    baseUrl: "https://evolution.exemplo.com/",
    apiKey: "chave-secreta",
    instance: "Comprarcasa Teste",
    fetch: fetchMock as unknown as typeof fetch,
  });
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return {
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
  };
  return { client, fetchMock, lastCall };
}

describe("evolution client — sendText", () => {
  it("envia o texto para a instância, com a chave no cabeçalho apikey", async () => {
    const { client, lastCall } = setup({
      status: 201,
      body: { key: { id: "3EB0SENT", fromMe: true }, messageTimestamp: 1794880000 },
    });

    const result = await client.sendText("351912345678@s.whatsapp.net", "Bom dia!");

    expect(lastCall()).toMatchObject({
      url: "https://evolution.exemplo.com/message/sendText/Comprarcasa%20Teste",
      method: "POST",
      body: { number: "351912345678@s.whatsapp.net", text: "Bom dia!" },
    });
    expect(lastCall().headers.get("apikey")).toBe("chave-secreta");
    expect(lastCall().headers.get("content-type")).toBe("application/json");
    expect(result).toEqual({
      externalId: "3EB0SENT",
      sentAt: new Date(1794880000 * 1000),
    });
  });

  it("ainda devolve um id quando a resposta não traz a chave da mensagem", async () => {
    const { client } = setup({ status: 201, body: {} });

    const result = await client.sendText("351912345678@s.whatsapp.net", "Oi");

    expect(result.externalId).toMatch(/^portal-[0-9a-f-]{36}$/);
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it.each([
    ["servidor fora do ar", new TypeError("fetch failed"), 502, "WHATSAPP_UNAVAILABLE"],
    ["erro 500", { status: 500, body: { error: "Internal" } }, 502, "WHATSAPP_UNAVAILABLE"],
    ["chave recusada", { status: 401, body: {} }, 502, "WHATSAPP_AUTH"],
    ["instância inexistente", { status: 404, body: {} }, 502, "WHATSAPP_INSTANCE"],
    ["número recusado", { status: 400, body: { response: { message: [{ exists: false }] } } }, 422, "WHATSAPP_REJECTED"],
  ] as const)("traduz %s em erro claro, sem vazar a chave", async (_caso, reply, status, code) => {
    const { client } = setup(reply);

    const error = await client
      .sendText("351912345678@s.whatsapp.net", "Oi")
      .catch((e) => e);

    expect(error).toMatchObject({ status, code });
    expect(String(error.message)).not.toContain("chave-secreta");
  });
});

describe("evolution client — instância e webhook", () => {
  it("consulta o estado da conexão", async () => {
    const { client, lastCall } = setup({
      body: { instance: { instanceName: "Comprarcasa Teste", state: "open" } },
    });

    expect(await client.getConnectionState()).toBe("open");
    expect(lastCall()).toMatchObject({
      url: "https://evolution.exemplo.com/instance/connectionState/Comprarcasa%20Teste",
      method: "GET",
    });
  });

  it("devolve null quando não há webhook registrado", async () => {
    const { client, lastCall } = setup({ body: null });

    expect(await client.findWebhook()).toBeNull();
    expect(lastCall().url).toBe(
      "https://evolution.exemplo.com/webhook/find/Comprarcasa%20Teste",
    );
  });

  it("devolve o webhook registrado, sem os cabeçalhos (que guardam o segredo)", async () => {
    const { client } = setup({
      body: {
        id: "w1",
        url: "https://outro.exemplo.com/hook",
        enabled: true,
        events: ["MESSAGES_UPSERT"],
        headers: { [WEBHOOK_SECRET_HEADER]: "segredo" },
      },
    });

    expect(await client.findWebhook()).toEqual({
      url: "https://outro.exemplo.com/hook",
      enabled: true,
      events: ["MESSAGES_UPSERT"],
    });
  });

  it("registra o webhook só para mensagens, com o segredo no cabeçalho", async () => {
    const { client, lastCall } = setup({ status: 201, body: { id: "w1" } });

    await client.setWebhook({
      url: "https://portal.exemplo.com/api/webhooks/evolution",
      secret: "segredo-do-webhook",
    });

    expect(lastCall()).toMatchObject({
      url: "https://evolution.exemplo.com/webhook/set/Comprarcasa%20Teste",
      method: "POST",
      body: {
        webhook: {
          enabled: true,
          url: "https://portal.exemplo.com/api/webhooks/evolution",
          headers: { [WEBHOOK_SECRET_HEADER]: "segredo-do-webhook" },
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT"],
        },
      },
    });
  });
});

describe("evolution client — leitura e digitação", () => {
  it("envia com atraso de digitação em milissegundos", async () => {
    const { client, lastCall } = setup({ status: 201, body: { key: { id: "X" } } });

    await client.sendText("351912345678@s.whatsapp.net", "Olá", { typingMs: 2500.4 });

    expect(lastCall().body).toEqual({
      number: "351912345678@s.whatsapp.net",
      text: "Olá",
      delay: 2500,
    });
  });

  it("marca as mensagens recebidas como lidas", async () => {
    const { client, lastCall } = setup({ status: 201, body: {} });

    await client.markAsRead([{ remoteJid: "351912345678@s.whatsapp.net", id: "3EB0A" }]);

    expect(lastCall()).toMatchObject({
      url: "https://evolution.exemplo.com/chat/markMessageAsRead/Comprarcasa%20Teste",
      method: "POST",
      body: {
        readMessages: [{ remoteJid: "351912345678@s.whatsapp.net", id: "3EB0A", fromMe: false }],
      },
    });
  });

  it("não chama a API quando não há o que marcar como lido", async () => {
    const { client, fetchMock } = setup();

    await client.markAsRead([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mostra 'a escrever' pelo tempo pedido", async () => {
    const { client, lastCall } = setup({ status: 201, body: {} });

    await client.showTyping("351912345678@s.whatsapp.net", 4000);

    expect(lastCall()).toMatchObject({
      url: "https://evolution.exemplo.com/chat/sendPresence/Comprarcasa%20Teste",
      body: { number: "351912345678@s.whatsapp.net", presence: "composing", delay: 4000 },
    });
  });
});
