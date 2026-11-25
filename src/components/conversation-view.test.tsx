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
  stage: "HUMANO",
  seller: null,
  assignedAt: null,
  qualification: null,
  qualificationSummary: null,
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
  sentByBot: false,
  sentAt: "2026-11-17T12:00:00.000Z",
};
const sent = {
  id: "m2",
  direction: "ENVIADA",
  type: "TEXTO",
  text: "Bom dia!",
  sentByBot: false,
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
        body: { lead: { ...lead, stage: "PARADO", automationPaused: true } },
      },
    });
    const user = userEvent.setup();
    render(<ConversationView leadId="l1" />);

    await user.selectOptions(await screen.findByLabelText("Etapa"), "PARADO");

    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      path: "/api/leads/l1/etapa",
      body: { stage: "PARADO" },
    });
    expect(
      await screen.findByText("Desligada: o contato não está com a assistente."),
    ).toBeInTheDocument();
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
      "GET /api/leads/l1": {
        body: { ...conversation.body, lead: { ...lead, stage: "QUALIFICANDO" } },
      },
      "PATCH /api/leads/l1/automacao": {
        body: { lead: { ...lead, stage: "QUALIFICANDO", automationPaused: true } },
      },
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

describe("ConversationView — qualificação por IA", () => {
  it("marca as mensagens da assistente e avisa que ela está conduzindo a conversa", async () => {
    const bot = { ...sent, id: "m3", text: "Você quer comprar ou alugar?", sentByBot: true };
    mockApi({
      "GET /api/leads/l1": {
        body: { lead: { ...lead, stage: "QUALIFICANDO" }, messages: [received, bot], tasks: [] },
      },
    });
    render(<ConversationView leadId="l1" />);

    // A etapa aparece no selo e no seletor do funil.
    expect(await screen.findAllByText("Com a assistente")).toHaveLength(2);
    expect(screen.getByText(/A assistente virtual está conversando/)).toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem da assistente")).toHaveTextContent("Assistente");
  });

  it("mostra o vendedor e o resumo depois da distribuição", async () => {
    mockApi({
      "GET /api/leads/l1": {
        body: {
          lead: {
            ...lead,
            stage: "DISTRIBUIDO",
            seller: { id: "u1", name: "Carlos Pereira" },
            assignedAt: "2026-11-18T15:00:00.000Z",
            qualificationSummary: "Quer comprar apto 2 quartos em Moema.",
          },
          messages: [received],
          tasks: [],
        },
      },
    });
    render(<ConversationView leadId="l1" />);

    expect(await screen.findByText("Quer comprar apto 2 quartos em Moema.")).toBeInTheDocument();
    expect(screen.getAllByText(/Carlos Pereira/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/A assistente virtual está conversando/)).not.toBeInTheDocument();
  });
});
