import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import "../../tests/router-mock";
import { LeadsView } from "./leads-view";

afterEach(() => vi.unstubAllGlobals());

const maria = {
  id: "l1",
  name: "Maria Silva",
  phone: "351912345678",
  lastMessageAt: "2026-11-17T12:00:00.000Z",
  lastMessageText: "Ainda está disponível?",
  stage: "QUALIFICACAO",
  automationPaused: false,
  stageChangedAt: "2026-11-17T12:00:00.000Z",
  won: null,
  lost: null,
  nextTaskDue: null,
};
const semNome = {
  id: "l2",
  name: null,
  phone: "351933333333",
  lastMessageAt: "2026-11-16T09:00:00.000Z",
  lastMessageText: "[imagem]",
  stage: "PERDIDO",
  automationPaused: true,
  stageChangedAt: "2026-11-17T12:00:00.000Z",
  won: null,
  lost: null,
  nextTaskDue: null,
};

describe("LeadsView", () => {
  it("lista os leads com link para a conversa", async () => {
    mockApi({ "GET /api/leads": { body: { leads: [maria, semNome] } } });
    render(<LeadsView />);

    const link = await screen.findByRole("link", { name: /Maria Silva/ });

    expect(link).toHaveAttribute("href", "/leads/l1");
    expect(within(link).getByText("Ainda está disponível?")).toBeInTheDocument();
    expect(within(link).getByText("+351 912 345 678")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+351 933 333 333/ })).toHaveAttribute(
      "href",
      "/leads/l2",
    );
  });

  it("filtra por etapa com contagem e mostra os avisos de cada contato", async () => {
    const pausado = {
      ...maria,
      id: "l3",
      name: "João",
      automationPaused: true,
      nextTaskDue: "2020-01-01",
    };
    mockApi({ "GET /api/leads": { body: { leads: [maria, semNome, pausado] } } });
    const user = userEvent.setup();
    render(<LeadsView />);

    await screen.findByRole("link", { name: /Maria Silva/ });
    expect(screen.getByRole("tab", { name: "Todos 3" })).toHaveAttribute("aria-selected", "true");
    const joao = screen.getByRole("link", { name: /João/ });
    expect(within(joao).getByText("IA pausada")).toBeInTheDocument();
    expect(within(joao).getByText("Tarefa vencida")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Perdido 1" }));
    expect(screen.queryByRole("link", { name: /Maria Silva/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /933/ })).getByText("Perdido")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Ganho 0" }));
    expect(screen.getByText("Nenhum contato nesta etapa.")).toBeInTheDocument();
  });

  it("explica o que fazer quando ainda não há leads", async () => {
    mockApi({ "GET /api/leads": { body: { leads: [] } } });
    render(<LeadsView />);

    expect(await screen.findByText("Nenhum lead ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conferir a conexão do WhatsApp" })).toHaveAttribute(
      "href",
      "/whatsapp",
    );
  });

  it("permite tentar de novo quando a lista não carrega", async () => {
    mockApi({ "GET /api/leads": apiError(500, "INTERNAL", "Erro interno. Tente novamente.") });
    const user = userEvent.setup();
    render(<LeadsView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro interno");

    mockApi({ "GET /api/leads": { body: { leads: [maria] } } });
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByRole("link", { name: /Maria Silva/ })).toBeInTheDocument();
  });
});
