import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import "../../tests/router-mock";
import { ConversationView } from "./conversation-view";

afterEach(() => vi.unstubAllGlobals());

const lead = {
  id: "l1",
  name: "Maria Silva",
  phone: "351912345678",
  lastMessageAt: "2026-11-17T12:01:00.000Z",
  lastMessageText: "Bom dia!",
  stage: "QUALIFICACAO",
  automationPaused: false,
  stageChangedAt: "2026-11-17T12:00:00.000Z",
  won: null,
  lost: null,
  nextTaskDue: null,
};
const received = {
  id: "m1",
  direction: "RECEBIDA",
  type: "TEXTO",
  text: "Olá, vi o anúncio do T2",
  sentAt: "2026-11-17T12:00:00.000Z",
};
const sent = {
  id: "m2",
  direction: "ENVIADA",
  type: "TEXTO",
  text: "Bom dia!",
  sentAt: "2026-11-17T12:01:00.000Z",
};
const conversation = { body: { lead, messages: [received, sent], tasks: [] } };

describe("ConversationView", () => {
  it("mostra quem é o lead e a conversa em ordem, diferenciando quem falou", async () => {
    mockApi({ "GET /api/leads/l1": conversation });
    render(<ConversationView leadId="l1" />);

    expect(await screen.findByRole("heading", { name: "Maria Silva" })).toBeInTheDocument();
    expect(screen.getByText("+351 912 345 678")).toBeInTheDocument();
    const items = within(screen.getByRole("log", { name: "Conversa" })).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Mensagem recebida",
      "Mensagem enviada",
    ]);
    expect(items[0]).toHaveTextContent("Olá, vi o anúncio do T2");
    expect(items[1]).toHaveTextContent("Bom dia!");
    expect(screen.getByRole("link", { name: /Leads/ })).toHaveAttribute("href", "/leads");
  });

  it("envia a resposta, mostra na conversa e limpa o campo", async () => {
    const reply = { ...sent, id: "m3", text: "Posso mostrar amanhã às 10h." };
    const { calls } = mockApi({
      "GET /api/leads/l1": conversation,
      "POST /api/leads/l1/mensagens": { status: 201, body: { message: reply } },
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    const field = await screen.findByLabelText("Resposta");
    await user.type(field, "Posso mostrar amanhã às 10h.");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(calls.find((call) => call.method === "POST")).toEqual({
      method: "POST",
      path: "/api/leads/l1/mensagens",
      body: { text: "Posso mostrar amanhã às 10h." },
    });
    expect(await screen.findByText("Posso mostrar amanhã às 10h.")).toBeInTheDocument();
    expect(field).toHaveValue("");
  });

  it("não envia mensagem vazia", async () => {
    mockApi({ "GET /api/leads/l1": conversation });
    render(<ConversationView leadId="l1" />);
    await screen.findByLabelText("Resposta");

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("mantém o texto e mostra o motivo quando o envio falha", async () => {
    mockApi({
      "GET /api/leads/l1": conversation,
      "POST /api/leads/l1/mensagens": apiError(
        502,
        "WHATSAPP_UNAVAILABLE",
        "Não foi possível falar com o WhatsApp agora. Tente novamente.",
      ),
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    const field = await screen.findByLabelText("Resposta");
    await user.type(field, "Oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível falar com o WhatsApp agora. Tente novamente.",
    );
    expect(field).toHaveValue("Oi");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("avisa quando o lead não existe", async () => {
    mockApi({ "GET /api/leads/x": apiError(404, "LEAD_NOT_FOUND", "Lead não encontrado.") });
    render(<ConversationView leadId="x" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Lead não encontrado.");
    expect(screen.queryByLabelText("Resposta")).not.toBeInTheDocument();
  });

  it("muda a etapa e mostra que a IA desligou", async () => {
    const { calls } = mockApi({
      "GET /api/leads/l1": conversation,
      "PATCH /api/leads/l1/etapa": {
        body: { lead: { ...lead, stage: "EM_ANDAMENTO", automationPaused: true } },
      },
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    await user.selectOptions(await screen.findByLabelText("Etapa"), "EM_ANDAMENTO");

    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      path: "/api/leads/l1/etapa",
      body: { stage: "EM_ANDAMENTO" },
    });
    expect(await screen.findByText("Desligada fora da Qualificação.")).toBeInTheDocument();
  });

  it("pede os dados do ganho antes de fechar", async () => {
    const won = { type: "COMPRA", value: 350000.5, conditions: "Financiamento" };
    const { calls } = mockApi({
      "GET /api/leads/l1": conversation,
      "PATCH /api/leads/l1/etapa": {
        body: { lead: { ...lead, stage: "GANHO", automationPaused: true, won } },
      },
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    await user.selectOptions(await screen.findByLabelText("Etapa"), "GANHO");
    const dialog = screen.getByRole("dialog", { name: "Marcar como ganho" });
    await user.type(within(dialog).getByLabelText("Valor (R$)"), "R$ 350.000,50");
    await user.type(within(dialog).getByLabelText("Condições (opcional)"), "Financiamento");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    expect(calls.at(-1)?.body).toEqual({
      stage: "GANHO",
      wonType: "COMPRA",
      wonValue: 350000.5,
      wonConditions: "Financiamento",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/Compra · R\$\s350\.000,50/)).toBeInTheDocument();
  });

  it("mostra o erro do campo quando falta o motivo do perdido", async () => {
    mockApi({
      "GET /api/leads/l1": conversation,
      "PATCH /api/leads/l1/etapa": apiError(400, "VALIDATION", "Dados inválidos.", {
        lostReason: "Selecione o motivo.",
      }),
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    await user.selectOptions(await screen.findByLabelText("Etapa"), "PERDIDO");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Selecione o motivo.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("pausa a IA", async () => {
    const { calls } = mockApi({
      "GET /api/leads/l1": conversation,
      "PATCH /api/leads/l1/automacao": { body: { lead: { ...lead, automationPaused: true } } },
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    await user.click(await screen.findByRole("button", { name: "Pausar IA" }));

    expect(calls.at(-1)?.body).toEqual({ paused: true });
    expect(await screen.findByRole("button", { name: "Retomar IA" })).toBeInTheDocument();
  });

  it("cria e conclui uma tarefa", async () => {
    const task = { id: "t1", title: "Ligar", dueDate: "2026-11-25", done: false };
    const { calls } = mockApi({
      "GET /api/leads/l1": conversation,
      "POST /api/leads/l1/tarefas": { status: 201, body: { task } },
      "PATCH /api/leads/l1/tarefas/t1": { body: { task: { ...task, done: true } } },
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    await user.type(await screen.findByLabelText("Nova tarefa"), "Ligar");
    const date = screen.getByLabelText("Data");
    await user.clear(date);
    await user.type(date, "2026-11-25");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      title: "Ligar",
      dueDate: "2026-11-25",
    });
    const checkbox = await screen.findByRole("checkbox", { name: "Concluir: Ligar" });
    expect(screen.getByText("25/11/2026")).toBeInTheDocument();

    await user.click(checkbox);
    expect(calls.at(-1)?.body).toEqual({ done: true });
    expect(await screen.findByRole("checkbox", { name: "Concluir: Ligar" })).toBeChecked();
  });
});
