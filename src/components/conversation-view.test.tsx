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
const conversation = { body: { lead, messages: [received, sent] } };

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
});
