import { expect, type Page, test } from "@playwright/test";
import { MANAGER } from "./env";

const seller = {
  name: "Vera Vendedora",
  email: `vera.${Date.now()}@e2e.test`,
  phone: "(11) 98888-7777",
  password: "senha-da-vera-123",
};

/** Alertas da aplicação (o Next mantém um role="alert" próprio, vazio, para leitores de tela). */
const appAlert = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("sem sessão, o portal leva para o login", async ({ page }) => {
  await page.goto("/colaboradores");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar no portal" })).toBeVisible();
});

test("login com senha errada mostra erro genérico", async ({ page }) => {
  await login(page, MANAGER.email, "senha-errada");

  await expect(appAlert(page)).toHaveText("E-mail ou senha inválidos.");
  await expect(page).toHaveURL(/\/login$/);
});

test("gestor cadastra vendedor, que cria a senha pelo link e entra com acesso restrito", async ({
  page,
}) => {
  // Gestor entra e cadastra o vendedor.
  await login(page, MANAGER.email, MANAGER.password);
  await expect(page.getByRole("heading", { name: "Olá, Gestora" })).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Colaboradores" }).click();
  await page.getByRole("button", { name: "Novo colaborador" }).click();
  const form = page.getByRole("dialog", { name: "Novo colaborador" });
  await form.getByLabel("Nome completo").fill(seller.name);
  await form.getByLabel("E-mail").fill(seller.email);
  await form.getByLabel("WhatsApp").fill(seller.phone);
  await form.getByLabel("Papel").selectOption("VENDEDOR");
  await form.getByRole("button", { name: "Cadastrar e gerar link" }).click();

  // O link de convite aparece para ser copiado.
  const linkDialog = page.getByRole("dialog", { name: "Link de acesso" });
  const inviteUrl = await linkDialog.getByLabel("Link de acesso").inputValue();
  expect(inviteUrl).toMatch(/\/convite\/[A-Za-z0-9_-]{43}$/);
  await linkDialog.getByRole("button", { name: "Concluir" }).click();

  const row = page.getByRole("row", { name: new RegExp(seller.name) });
  await expect(row).toContainText("Convite pendente");
  await expect(row).toContainText("+55 (11) 98888-7777");

  // Antes de aceitar o convite, o vendedor ainda não consegue entrar.
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, seller.email, seller.password);
  await expect(appAlert(page)).toHaveText("E-mail ou senha inválidos.");

  // Vendedor abre o link, cria a senha e já cai dentro do portal.
  await page.goto(inviteUrl);
  await expect(page.getByText(`Olá, ${seller.name}!`)).toBeVisible();
  await page.getByLabel("Crie sua senha").fill(seller.password);
  await page.getByLabel("Repita a senha").fill(seller.password);
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Vera" })).toBeVisible();

  // Acesso restrito: sem menu de gestão, sem a página e sem a API.
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Colaboradores" }),
  ).toHaveCount(0);
  await page.goto("/colaboradores");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Olá, Vera" })).toBeVisible();
  const api = await page.request.get("/api/colaboradores");
  expect(api.status()).toBe(403);

  // O link é de uso único.
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(inviteUrl);
  await expect(appAlert(page)).toHaveText(
    "Este link de convite já foi utilizado.",
  );

  // Daí em diante o vendedor entra com e-mail e senha.
  await login(page, seller.email, seller.password);
  await expect(page.getByRole("heading", { name: "Olá, Vera" })).toBeVisible();
});

test("gestor desativa um colaborador e a sessão dele cai na hora", async ({
  browser,
  page,
}) => {
  const email = `caio.${Date.now()}@e2e.test`;

  // Gestor cadastra e pega o link.
  await login(page, MANAGER.email, MANAGER.password);
  await page.getByRole("navigation").getByRole("link", { name: "Colaboradores" }).click();
  await page.getByRole("button", { name: "Novo colaborador" }).click();
  const form = page.getByRole("dialog", { name: "Novo colaborador" });
  await form.getByLabel("Nome completo").fill("Caio Corretor");
  await form.getByLabel("E-mail").fill(email);
  await form.getByLabel("WhatsApp").fill("11977776666");
  await form.getByRole("button", { name: "Cadastrar e gerar link" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Link de acesso" });
  const inviteUrl = await linkDialog.getByLabel("Link de acesso").inputValue();
  await linkDialog.getByRole("button", { name: "Concluir" }).click();

  // Colaborador ativa a conta em outro navegador.
  const sellerContext = await browser.newContext();
  const sellerPage = await sellerContext.newPage();
  await sellerPage.goto(inviteUrl);
  await sellerPage.getByLabel("Crie sua senha").fill("senha-do-caio-123");
  await sellerPage.getByLabel("Repita a senha").fill("senha-do-caio-123");
  await sellerPage.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(sellerPage.getByRole("heading", { name: "Olá, Caio" })).toBeVisible();

  // Gestor desativa.
  await page.reload();
  const row = page.getByRole("row", { name: /Caio Corretor/ });
  await expect(row).toContainText("Ativo");
  await row.getByRole("button", { name: "Desativar Caio Corretor" }).click();
  await expect(row).toContainText("Inativo");

  // A sessão aberta do colaborador deixa de valer.
  await sellerPage.goto("/");
  await expect(sellerPage).toHaveURL(/\/login$/);
  await sellerContext.close();
});
