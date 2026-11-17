import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import "../../tests/router-mock";
import { CollaboratorsView } from "./collaborators-view";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const gestora = {
  id: "g1",
  name: "Gestora Demo",
  email: "gestora@exemplo.com",
  phone: "5511911112222",
  role: "GESTOR",
  status: "ATIVO",
  createdAt: "2026-11-01T12:00:00.000Z",
};
const bia = {
  id: "v1",
  name: "Bia Lima",
  email: "bia@exemplo.com",
  phone: "5511988887777",
  role: "VENDEDOR",
  status: "ATIVO",
  createdAt: "2026-11-02T12:00:00.000Z",
};
const list = { body: { collaborators: [bia, gestora] } };
const invite = {
  url: "http://localhost:3000/convite/tok-novo",
  expiresAt: "2026-11-24T15:30:00.000Z",
};

function renderView() {
  render(<CollaboratorsView currentUserId="g1" />);
  return userEvent.setup();
}

const row = async (name: string) =>
  (await screen.findByRole("cell", { name })).closest("tr")!;

describe("CollaboratorsView", () => {
  it("lista os colaboradores com papel, telefone e status", async () => {
    mockApi({ "GET /api/colaboradores": list });
    renderView();

    const biaRow = within(await row("Bia Lima"));

    expect(biaRow.getByText("bia@exemplo.com")).toBeInTheDocument();
    expect(biaRow.getByText("+55 (11) 98888-7777")).toBeInTheDocument();
    expect(biaRow.getByText("Vendedor")).toBeInTheDocument();
    expect(biaRow.getByText("Ativo")).toBeInTheDocument();
  });

  it("não oferece desativar a própria conta", async () => {
    mockApi({ "GET /api/colaboradores": list });
    renderView();

    const own = within(await row("Gestora Demo"));

    expect(own.getByText("Você")).toBeInTheDocument();
    expect(own.queryByRole("button", { name: /Desativar/ })).not.toBeInTheDocument();
    expect(
      within(await row("Bia Lima")).getByRole("button", { name: /Desativar/ }),
    ).toBeInTheDocument();
  });

  it("permite tentar de novo quando a lista não carrega", async () => {
    mockApi({
      "GET /api/colaboradores": apiError(500, "INTERNAL", "Erro interno. Tente novamente."),
    });
    const user = renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro interno");

    mockApi({ "GET /api/colaboradores": list });
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByRole("cell", { name: "Bia Lima" })).toBeInTheDocument();
  });

  it("cadastra um colaborador e mostra o link de convite para copiar", async () => {
    const criado = { ...bia, id: "v2", name: "Caio Reis", email: "caio@exemplo.com", status: "PENDENTE" };
    const { calls } = mockApi({
      "GET /api/colaboradores": list,
      "POST /api/colaboradores": { status: 201, body: { collaborator: criado, invite } },
    });
    const user = renderView();

    await user.click(await screen.findByRole("button", { name: "Novo colaborador" }));
    const form = within(screen.getByRole("dialog", { name: "Novo colaborador" }));
    await user.type(form.getByLabelText("Nome completo"), "Caio Reis");
    await user.type(form.getByLabelText("E-mail"), "caio@exemplo.com");
    await user.type(form.getByLabelText("WhatsApp"), "(11) 97777-6666");
    await user.selectOptions(form.getByLabelText("Papel"), "VENDEDOR");
    await user.click(form.getByRole("button", { name: "Cadastrar e gerar link" }));

    expect(calls.at(-1)).toEqual({
      method: "POST",
      path: "/api/colaboradores",
      body: {
        name: "Caio Reis",
        email: "caio@exemplo.com",
        phone: "(11) 97777-6666",
        role: "VENDEDOR",
      },
    });
    const dialog = within(await screen.findByRole("dialog", { name: "Link de acesso" }));
    expect(dialog.getByLabelText("Link de acesso")).toHaveValue(invite.url);
    expect(dialog.getByText(/Caio Reis/)).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Copiar link" }));

    expect(await navigator.clipboard.readText()).toBe(invite.url);
    expect(dialog.getByRole("button", { name: "Link copiado" })).toBeInTheDocument();
    expect(within(await row("Caio Reis")).getByText("Convite pendente")).toBeInTheDocument();
  });

  it("mostra os erros de validação do servidor nos campos", async () => {
    mockApi({
      "GET /api/colaboradores": list,
      "POST /api/colaboradores": apiError(400, "VALIDATION", "Dados inválidos.", {
        phone: "Telefone inválido. Informe DDD e número.",
      }),
    });
    const user = renderView();

    await user.click(await screen.findByRole("button", { name: "Novo colaborador" }));
    const form = within(screen.getByRole("dialog"));
    await user.type(form.getByLabelText("Nome completo"), "Caio Reis");
    await user.type(form.getByLabelText("E-mail"), "caio@exemplo.com");
    await user.type(form.getByLabelText("WhatsApp"), "123");
    await user.click(form.getByRole("button", { name: "Cadastrar e gerar link" }));

    expect(
      await form.findByText("Telefone inválido. Informe DDD e número."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Novo colaborador" })).toBeInTheDocument();
  });

  it("edita um colaborador com o formulário já preenchido", async () => {
    const { calls } = mockApi({
      "GET /api/colaboradores": list,
      "PATCH /api/colaboradores/v1": {
        body: { collaborator: { ...bia, name: "Bia Lima Santos", role: "GESTOR" } },
      },
    });
    const user = renderView();

    await user.click(within(await row("Bia Lima")).getByRole("button", { name: "Editar Bia Lima" }));
    const form = within(screen.getByRole("dialog", { name: "Editar colaborador" }));
    expect(form.getByLabelText("E-mail")).toHaveValue("bia@exemplo.com");
    await user.clear(form.getByLabelText("Nome completo"));
    await user.type(form.getByLabelText("Nome completo"), "Bia Lima Santos");
    await user.selectOptions(form.getByLabelText("Papel"), "GESTOR");
    await user.click(form.getByRole("button", { name: "Salvar" }));

    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/api/colaboradores/v1",
      body: { name: "Bia Lima Santos", email: "bia@exemplo.com", role: "GESTOR" },
    });
    expect(within(await row("Bia Lima Santos")).getByText("Gestor")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("desativa e reativa um colaborador", async () => {
    const { calls } = mockApi({
      "GET /api/colaboradores": list,
      "PATCH /api/colaboradores/v1": ({ body }) => ({
        body: {
          collaborator: {
            ...bia,
            status: (body as { active: boolean }).active ? "ATIVO" : "INATIVO",
          },
        },
      }),
    });
    const user = renderView();

    await user.click(
      within(await row("Bia Lima")).getByRole("button", { name: "Desativar Bia Lima" }),
    );

    expect(calls.at(-1)?.body).toEqual({ active: false });
    expect(within(await row("Bia Lima")).getByText("Inativo")).toBeInTheDocument();

    await user.click(
      within(await row("Bia Lima")).getByRole("button", { name: "Reativar Bia Lima" }),
    );

    expect(calls.at(-1)?.body).toEqual({ active: true });
    expect(within(await row("Bia Lima")).getByText("Ativo")).toBeInTheDocument();
  });

  it("gera um novo link de acesso para um colaborador", async () => {
    const { calls } = mockApi({
      "GET /api/colaboradores": list,
      "POST /api/colaboradores/v1/convite": { status: 201, body: { invite } },
    });
    const user = renderView();

    await user.click(
      within(await row("Bia Lima")).getByRole("button", { name: "Gerar link de acesso para Bia Lima" }),
    );

    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/api/colaboradores/v1/convite" });
    const dialog = within(await screen.findByRole("dialog", { name: "Link de acesso" }));
    expect(dialog.getByLabelText("Link de acesso")).toHaveValue(invite.url);
  });

  it("mostra o motivo quando uma ação é recusada", async () => {
    mockApi({
      "GET /api/colaboradores": list,
      "PATCH /api/colaboradores/v1": apiError(
        409,
        "LAST_MANAGER",
        "O portal precisa de pelo menos um gestor ativo.",
      ),
    });
    const user = renderView();

    await user.click(
      within(await row("Bia Lima")).getByRole("button", { name: "Desativar Bia Lima" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O portal precisa de pelo menos um gestor ativo.",
    );
    expect(within(await row("Bia Lima")).getByText("Ativo")).toBeInTheDocument();
  });
});
