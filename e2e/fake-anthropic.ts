import { createServer, type Server } from "node:http";
import { FAKE_ANTHROPIC_PORT, QUALIFICATION_DONE_WORD } from "./env";

type ApiMessage = { role: string; content: string };

/**
 * Imita a Messages API da Anthropic para a IA de qualificação, sem custo e
 * de forma previsível: pergunta enquanto o lead não menciona a palavra
 * combinada; quando menciona, encerra com um resumo.
 */
export async function startFakeAnthropic() {
  const calls: { messages: ApiMessage[] }[] = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        return reply(404, { type: "error", error: { type: "not_found_error", message: "?" } });
      }

      const body = JSON.parse(Buffer.concat(chunks).toString()) as { messages: ApiMessage[] };
      calls.push(body);
      const lastUser = body.messages.at(-1)?.content ?? "";
      const done = lastUser.includes(QUALIFICATION_DONE_WORD);
      const turn = {
        reply: done ? "Obrigada pelas informações!" : "Legal! Você procura para comprar ou alugar?",
        collected: {
          objetivo: done ? "comprar" : null,
          tipoImovel: "apartamento",
          regiao: done ? QUALIFICATION_DONE_WORD : null,
          faixaValor: null,
          pagamento: null,
          prazo: null,
          observacoes: null,
        },
        done,
        summary: done ? `Quer comprar apartamento em ${QUALIFICATION_DONE_WORD}.` : null,
      };
      return reply(200, {
        id: `msg_e2e_${calls.length}`,
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify(turn) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(FAKE_ANTHROPIC_PORT, resolve));
  return {
    calls,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
