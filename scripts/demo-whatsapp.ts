/**
 * Demonstração local do WhatsApp, sem tocar no WhatsApp real.
 *
 * 1. Sobe uma Evolution API falsa em http://localhost:3199 (o portal fala com ela
 *    como se fosse a real: estado "conectado", registro de webhook e envio).
 * 2. Entrega ao portal algumas conversas de exemplo, como a Evolution faria.
 * 3. Fica aberto: cada linha digitada no terminal vira uma nova mensagem
 *    recebida. Formato: `<n> <texto>` (n = número do contato, 1 a 3) ou
 *    `novo <nome> <texto>` para um contato novo.
 *
 * Uso (com o portal rodando e as variáveis EVOLUTION_* de demo no .env.local):
 *   pnpm tsx --env-file-if-exists=.env.local scripts/demo-whatsapp.ts
 */
import { createServer } from "node:http";
import { createInterface } from "node:readline";

const PORT = 3199;
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? "Demo comprarCasa";
const SECRET = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";

let webhook: { url: string; enabled: boolean; events: string[] } | null = null;
let seq = 0;

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const path = decodeURIComponent(req.url ?? "");
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : undefined;
    const reply = (status: number, data: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (path.startsWith("/message/sendText/")) {
      seq += 1;
      console.log(`\n📤 Portal enviou para ${body?.number}: "${body?.text}"`);
      return reply(201, {
        key: { id: `DEMO-OUT-${Date.now()}-${seq}`, fromMe: true },
        messageTimestamp: Math.floor(Date.now() / 1000),
      });
    }
    if (path.startsWith("/instance/connectionState/")) {
      return reply(200, { instance: { state: "open" } });
    }
    if (path.startsWith("/webhook/find/")) return reply(200, webhook);
    if (path.startsWith("/webhook/set/")) {
      webhook = {
        url: body?.webhook?.url,
        enabled: true,
        events: body?.webhook?.events ?? [],
      };
      console.log(`\n🔗 Webhook registrado: ${webhook.url}`);
      return reply(201, { webhook });
    }
    return reply(404, { error: "Not Found" });
  });
}).listen(PORT, () => console.log(`Evolution falsa em http://localhost:${PORT}`));

type Contact = { name: string; phone: string };
const contacts: Contact[] = [
  { name: "Mariana Costa", phone: "5511987654321" },
  { name: "Ricardo Almeida", phone: "5521998877665" },
  { name: "Fernanda Lima", phone: "5531991234567" },
];

async function deliver(contact: Contact, text: string, secondsAgo = 0, fixedId?: string) {
  const response = await fetch(`${APP_URL}/api/webhooks/evolution`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    body: JSON.stringify({
      event: "messages.upsert",
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: `${contact.phone}@s.whatsapp.net`,
          fromMe: false,
          // Exemplos usam id fixo: rodar a demo de novo não duplica (o portal ignora reentregas).
          id: fixedId ?? `DEMO-IN-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        pushName: contact.name,
        message: { conversation: text },
        messageType: "conversation",
        messageTimestamp: Math.floor(Date.now() / 1000) - secondsAgo,
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  console.log(`📥 ${contact.name}: "${text}" → ${response.status} ${JSON.stringify(result)}`);
}

async function seed() {
  await deliver(contacts[0], "Olá! Vi o anúncio do apartamento de 2 quartos na Vila Mariana. Ainda está disponível?", 3600, "DEMO-SEED-1");
  await deliver(contacts[0], "Aceita financiamento pela Caixa?", 3500, "DEMO-SEED-2");
  await deliver(contacts[1], "Boa tarde, procuro uma casa com quintal até R$ 600 mil no Rio.", 1800, "DEMO-SEED-3");
  await deliver(contacts[2], "Oi, gostaria de agendar uma visita ao imóvel da Savassi.", 300, "DEMO-SEED-4");
}

void seed().then(() =>
  console.log(
    "\nDigite `<1-3> <texto>` para simular mensagem de um contato, " +
      "ou `novo <Nome> <texto>` para um contato novo. Ctrl+C sai.\n",
  ),
);

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const novo = line.match(/^novo\s+(\S+)\s+(.+)$/i);
  if (novo) {
    const contact = {
      name: novo[1],
      phone: `55119${String(Date.now()).slice(-8)}`,
    };
    contacts.push(contact);
    console.log(`(contato ${contacts.length}: ${contact.name})`);
    return deliver(contact, novo[2]);
  }
  const m = line.match(/^(\d+)\s+(.+)$/);
  const contact = m && contacts[Number(m[1]) - 1];
  if (!contact) return console.log("Formato: `<n> <texto>` ou `novo <Nome> <texto>`");
  await deliver(contact, m[2]);
});
