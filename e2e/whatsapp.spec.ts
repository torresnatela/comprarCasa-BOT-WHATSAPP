import { type APIRequestContext, expect, test } from "@playwright/test";
import { EVOLUTION, MANAGER } from "./env";
import { startFakeEvolution } from "./fake-evolution";

let evolution: Awaited<ReturnType<typeof startFakeEvolution>>;

test.beforeAll(async () => {
  evolution = await startFakeEvolution();
});
test.afterAll(() => evolution.stop());

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

test("mensagem do WhatsApp vira lead; o gestor vê a conversa e responde pelo portal", async ({
  page,
  request,
}) => {
  // Chega a primeira mensagem (e a Evolution reentrega a mesma).
  const first = await deliver(request, "Olá, vi o anúncio do T2", { id: `E2E-FIRST-${run}` });
  expect(await first.json()).toEqual({ ok: true, result: "stored" });
  const repeated = await deliver(request, "Olá, vi o anúncio do T2", { id: `E2E-FIRST-${run}` });
  expect(await repeated.json()).toEqual({ ok: true, result: "duplicate" });

  // O gestor encontra o lead na lista.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MANAGER.email);
  await page.getByLabel("Senha").fill(MANAGER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Leads" }).click();
  const leadLink = page.getByRole("link", { name: new RegExp(leadName) });
  await expect(leadLink).toContainText("Olá, vi o anúncio do T2");

  // Abre a conversa: uma mensagem só, apesar da reentrega.
  await leadLink.click();
  await expect(page.getByRole("heading", { name: leadName })).toBeVisible();
  const log = page.getByRole("log", { name: "Conversa" });
  await expect(log.getByRole("listitem")).toHaveCount(1);
  await expect(log.getByLabel("Mensagem recebida")).toContainText("Olá, vi o anúncio do T2");

  // Responde pelo portal: a Evolution recebe o envio com a chave e o destinatário.
  await page.getByLabel("Resposta").fill("Bom dia! Posso mostrar amanhã às 10h.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(log.getByLabel("Mensagem enviada")).toContainText(
    "Bom dia! Posso mostrar amanhã às 10h.",
  );
  await expect(page.getByLabel("Resposta")).toHaveValue("");
  const sent = evolution.requests.filter((r) => r.path.startsWith("/message/sendText/"));
  expect(sent).toEqual([
    {
      method: "POST",
      path: `/message/sendText/${EVOLUTION.instance}`,
      apikey: EVOLUTION.apiKey,
      body: { number: jid, text: "Bom dia! Posso mostrar amanhã às 10h." },
    },
  ]);

  // Uma nova mensagem do lead aparece sozinha, sem recarregar a página.
  await deliver(request, "Perfeito, combinado!");
  await expect(log.getByRole("listitem")).toHaveCount(3, { timeout: 15_000 });
  await expect(log.getByLabel("Mensagem recebida").last()).toContainText(
    "Perfeito, combinado!",
  );

  // A lista passa a mostrar a última mensagem.
  await page.getByRole("link", { name: "← Leads" }).click();
  await expect(page.getByRole("link", { name: new RegExp(leadName) })).toContainText(
    "Perfeito, combinado!",
  );
});

test("o gestor conduz o contato pelo funil: etapa, IA, tarefa e ganho", async ({
  page,
  request,
}) => {
  const name = `Funil E2E ${run}`;
  await deliver(request, "Quero alugar um apartamento", {
    from: `3518${String(run).slice(-8)}@s.whatsapp.net`,
    name,
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MANAGER.email);
  await page.getByLabel("Senha").fill(MANAGER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Leads" }).click();
  const leadLink = page.getByRole("link", { name: new RegExp(name) });
  await expect(leadLink).toContainText("Qualificação");
  await leadLink.click();

  // Pausa e retoma a IA na qualificação.
  await page.getByRole("button", { name: "Pausar IA" }).click();
  await page.getByRole("button", { name: "Retomar IA" }).click();
  await expect(page.getByRole("button", { name: "Pausar IA" })).toBeVisible();

  // Passa para atendimento humano: a IA desliga.
  await page.getByLabel("Etapa", { exact: true }).selectOption("EM_ANDAMENTO");
  await expect(page.getByText("Desligada fora da Qualificação.")).toBeVisible();

  // Cria uma tarefa vencida e conclui.
  await page.getByLabel("Nova tarefa").fill("Enviar fotos do imóvel");
  await page.getByLabel("Data").fill("2020-01-01");
  await page.getByRole("button", { name: "Adicionar" }).click();
  const task = page.getByRole("checkbox", { name: "Concluir: Enviar fotos do imóvel" });
  await expect(task).not.toBeChecked();

  // A lista avisa da tarefa vencida.
  await page.getByRole("link", { name: "← Leads" }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText(
    "Tarefa vencida",
  );
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("checkbox", { name: "Concluir: Enviar fotos do imóvel" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Concluir: Enviar fotos do imóvel" }),
  ).toBeChecked();

  // Fecha como ganho com os dados do negócio.
  await page.getByLabel("Etapa", { exact: true }).selectOption("GANHO");
  const dialog = page.getByRole("dialog", { name: "Marcar como ganho" });
  await dialog.getByLabel("Negócio").selectOption("ALUGUEL");
  await dialog.getByLabel("Valor (R$)").fill("3.500,00");
  await dialog.getByLabel("Condições (opcional)").fill("Contrato de 30 meses");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(/Aluguel · R\$\s3\.500,00/)).toBeVisible();
  await expect(page.getByText("Desligada: contato fechado.")).toBeVisible();

  await page.getByRole("link", { name: "← Leads" }).click();
  await page.getByRole("tab", { name: /^Ganho/ }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
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
