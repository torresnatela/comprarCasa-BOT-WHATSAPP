import { type APIRequestContext, expect, test } from "@playwright/test";
import { EVOLUTION, MANAGER, QUALIFICATION_DONE_WORD } from "./env";
import { startFakeAnthropic } from "./fake-anthropic";
import { startFakeEvolution } from "./fake-evolution";

let evolution: Awaited<ReturnType<typeof startFakeEvolution>>;
let anthropic: Awaited<ReturnType<typeof startFakeAnthropic>>;

test.beforeAll(async () => {
  evolution = await startFakeEvolution();
  anthropic = await startFakeAnthropic();
});
test.afterAll(async () => {
  await evolution.stop();
  await anthropic.stop();
});

/** Textos enviados pela Evolution para um número. */
const sentTo = (number: string) =>
  evolution.requests
    .filter((r) => r.path.startsWith("/message/sendText/"))
    .filter((r) => (r.body as { number: string }).number === number)
    .map((r) => (r.body as { text: string }).text);

const BOT_QUESTION = "Legal! Você procura para comprar ou alugar?";

const run = Date.now();
const phone = `3519${String(run).slice(-8)}`;
const jid = `${phone}@s.whatsapp.net`;
const leadName = `Maria E2E ${run}`;

/** Simula a Evolution entregando uma mensagem recebida no WhatsApp. */
function deliver(
  request: APIRequestContext,
  text: string,
  {
    secret = EVOLUTION.webhookSecret,
    id = `E2E-IN-${Math.random()}`,
    from = jid,
    name = leadName,
  } = {},
) {
  return request.post("/api/webhooks/evolution", {
    headers: { "x-webhook-secret": secret },
    data: {
      event: "messages.upsert",
      instance: EVOLUTION.instance,
      data: {
        key: { remoteJid: from, fromMe: false, id },
        pushName: name,
        message: { conversation: text },
        messageType: "conversation",
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
      apikey: "token-enviado-pela-evolution",
    },
  });
}

test("o webhook recusa chamadas sem o segredo correto", async ({ request }) => {
  const response = await deliver(request, "tentativa indevida", {
    secret: "segredo-errado",
  });

  expect(response.status()).toBe(401);
});

test("mensagem do WhatsApp vira lead; a assistente responde e o gestor assume pelo portal", async ({
  page,
  request,
}) => {
  // Chega a primeira mensagem (e a Evolution reentrega a mesma).
  const first = await deliver(request, "Olá, vi o anúncio do T2", { id: `E2E-FIRST-${run}` });
  expect(await first.json()).toEqual({ ok: true, result: "stored" });
  const repeated = await deliver(request, "Olá, vi o anúncio do T2", { id: `E2E-FIRST-${run}` });
  expect(await repeated.json()).toEqual({ ok: true, result: "duplicate" });

  // A assistente responde uma vez só, depois do webhook.
  await expect.poll(() => sentTo(jid)).toEqual([BOT_QUESTION]);

  // O gestor encontra o lead na lista.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MANAGER.email);
  await page.getByLabel("Senha").fill(MANAGER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Leads" }).click();
  const leadLink = page.getByRole("link", { name: new RegExp(leadName) });
  await expect(leadLink).toContainText(BOT_QUESTION);

  // Abre a conversa: uma mensagem recebida (apesar da reentrega) e a resposta da assistente.
  await leadLink.click();
  const heading = page.getByRole("heading", { name: leadName });
  await expect(heading).toBeVisible();
  // A etapa aparece ao lado do nome.
  const header = heading.locator("..");
  await expect(header).toContainText("Com a assistente");
  const log = page.getByRole("log", { name: "Conversa" });
  await expect(log.getByRole("listitem")).toHaveCount(2);
  await expect(log.getByLabel("Mensagem recebida")).toContainText("Olá, vi o anúncio do T2");
  await expect(log.getByLabel("Mensagem da assistente")).toContainText(BOT_QUESTION);

  // Responde pelo portal: a Evolution recebe o envio com a chave e o destinatário.
  await page.getByLabel("Resposta").fill("Bom dia! Posso mostrar amanhã às 10h.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(log.getByLabel("Mensagem enviada")).toContainText(
    "Bom dia! Posso mostrar amanhã às 10h.",
  );
  await expect(page.getByLabel("Resposta")).toHaveValue("");
  expect(evolution.requests.filter((r) => r.path.startsWith("/message/sendText/")).at(-1)).toEqual({
    method: "POST",
    path: `/message/sendText/${EVOLUTION.instance}`,
    apikey: EVOLUTION.apiKey,
    body: { number: jid, text: "Bom dia! Posso mostrar amanhã às 10h." },
  });
  // Com o gestor na conversa, a assistente sai de cena.
  await expect(header).toContainText("Com a equipe", { timeout: 15_000 });

  // Uma nova mensagem do lead aparece sozinha, sem recarregar a página.
  await deliver(request, "Perfeito, combinado!");
  await expect(log.getByRole("listitem")).toHaveCount(4, { timeout: 15_000 });
  await expect(log.getByLabel("Mensagem recebida").last()).toContainText(
    "Perfeito, combinado!",
  );

  // A lista passa a mostrar a última mensagem.
  await page.getByRole("link", { name: "← Leads" }).click();
  await expect(page.getByRole("link", { name: new RegExp(leadName) })).toContainText(
    "Perfeito, combinado!",
  );
});

test("a assistente qualifica o lead e o rodízio entrega ao próximo vendedor", async ({
  page,
  request,
}) => {
  const buyerPhone = `5511${String(run).slice(-9)}`;
  const buyerJid = `${buyerPhone}@s.whatsapp.net`;
  const buyerName = `João E2E ${run}`;

  // O gestor confere quem é o próximo da fila.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MANAGER.email);
  await page.getByLabel("Senha").fill(MANAGER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Rodízio" }).click();
  const queue = page.getByRole("list", { name: "Fila do rodízio" });
  const next = queue.getByRole("listitem").first();
  await expect(next).toContainText("próximo");
  const nextName = (await next.locator("p").first().innerText()).replace("próximo", "").trim();
  const nextFirstName = nextName.split(/\s+/)[0];

  // Lead conversa com a assistente até ela ter o que precisa.
  await deliver(request, "Oi, quero um apartamento", { from: buyerJid, name: buyerName });
  await expect.poll(() => sentTo(buyerJid)).toEqual([BOT_QUESTION]);
  await deliver(request, `Comprar, em ${QUALIFICATION_DONE_WORD}`, { from: buyerJid, name: buyerName });

  // Mensagem final com o nome do vendedor da vez.
  await expect
    .poll(() => sentTo(buyerJid).at(-1))
    .toBe(
      `Obrigada pelas informações! O ${nextFirstName} vai entrar em contato com você e te ajudar com o que precisa.`,
    );

  // O lead aparece entregue ao vendedor, com o resumo.
  await page.getByRole("navigation").getByRole("link", { name: "Leads" }).click();
  const leadLink = page.getByRole("link", { name: new RegExp(buyerName) });
  await expect(leadLink).toContainText(nextName);
  await leadLink.click();
  await expect(page.getByText(`Quer comprar apartamento em ${QUALIFICATION_DONE_WORD}.`)).toBeVisible();

  // Quem recebeu vai para o fim da fila.
  await page.getByRole("navigation").getByRole("link", { name: "Rodízio" }).click();
  await expect(queue.getByRole("listitem").first()).not.toContainText(nextName);
  await expect(queue.getByRole("listitem").filter({ hasText: nextName })).toContainText("1 lead recebido");
});

test("a tela de WhatsApp mostra a instância conectada e o webhook pendente", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MANAGER.email);
  await page.getByLabel("Senha").fill(MANAGER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "WhatsApp" }).click();

  await expect(page.getByText(EVOLUTION.instance)).toBeVisible();
  await expect(page.getByText("Conectada")).toBeVisible();
  await expect(page.getByText("Nenhum webhook registrado")).toBeVisible();

  // Em desenvolvimento o portal não tem endereço público: o registro é recusado com explicação.
  await page.getByRole("button", { name: "Registrar webhook" }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("endereço público com HTTPS");
});
