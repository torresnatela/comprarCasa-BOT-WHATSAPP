import { createServer, type Server } from "node:http";
import { FAKE_EVOLUTION_PORT } from "./env";

export type RecordedRequest = {
  method: string;
  path: string;
  apikey: string | undefined;
  body: unknown;
};

/**
 * Servidor que imita as rotas da Evolution API usadas pelo portal e guarda
 * o que recebeu, para o teste conferir o envio sem tocar no WhatsApp real.
 */
export async function startFakeEvolution() {
  const requests: RecordedRequest[] = [];
  let sequence = 0;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      const path = decodeURIComponent(req.url ?? "");
      requests.push({
        method: req.method ?? "",
        path,
        apikey: req.headers.apikey as string | undefined,
        body: raw ? JSON.parse(raw) : undefined,
      });

      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (path.startsWith("/message/sendText/")) {
        sequence += 1;
        return reply(201, {
          key: { id: `E2E-SENT-${Date.now()}-${sequence}`, fromMe: true },
          messageTimestamp: Math.floor(Date.now() / 1000),
        });
      }
      if (path.startsWith("/chat/markMessageAsRead/") || path.startsWith("/chat/sendPresence/")) {
        return reply(201, {});
      }
      if (path.startsWith("/instance/connectionState/")) {
        return reply(200, { instance: { state: "open" } });
      }
      if (path.startsWith("/webhook/find/")) return reply(200, null);
      return reply(404, { error: "Not Found" });
    });
  });

  await new Promise<void>((resolve) => server.listen(FAKE_EVOLUTION_PORT, resolve));

  return {
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
