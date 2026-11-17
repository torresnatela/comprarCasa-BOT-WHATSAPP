import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import "../../tests/router-mock";
import { WhatsappSettings } from "./whatsapp-settings";

afterEach(() => vi.unstubAllGlobals());

const HOOK = "https://portal.imobiliaria.com/api/webhooks/evolution";
const base = {
  configured: true,
  instance: "Comprarcasa Teste",
  connected: true,
  webhookUrl: HOOK,
  webhook: null,
};
const here = { url: HOOK, enabled: true, pointsHere: true };
const elsewhere = { url: "https://n8n.exemplo.com/hook", enabled: true, pointsHere: false };

const status = (overrides: object = {}) => ({ body: { status: { ...base, ...overrides } } });

describe("WhatsappSettings", () => {
  it("mostra a instância conectada e que falta registrar o webhook", async () => {
    mockApi({ "GET /api/whatsapp/status": status() });
    render(<WhatsappSettings />);

    expect(await screen.findByText("Comprarcasa Teste")).toBeInTheDocument();
    expect(screen.getByText("Conectada")).toBeInTheDocument();
    expect(screen.getByText("Nenhum webhook registrado")).toBeInTheDocument();
    expect(screen.getByText(HOOK)).toBeInTheDocument();
  });

  it("avisa quando o número está desconectado", async () => {
    mockApi({ "GET /api/whatsapp/status": status({ connected: false }) });
    render(<WhatsappSettings />);

    expect(await screen.findByText("Desconectada")).toBeInTheDocument();
  });

  it("registra o webhook e passa a mostrar que está ativo", async () => {
    const { calls } = mockApi({
      "GET /api/whatsapp/status": status(),
      "POST /api/whatsapp/webhook": status({ webhook: here }),
    });
    const user = userEvent.setup();
    render(<WhatsappSettings />);

    await user.click(await screen.findByRole("button", { name: "Registrar webhook" }));

    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/api/whatsapp/webhook" });
    expect(await screen.findByText("Recebendo mensagens neste portal")).toBeInTheDocument();
  });

  it("pede confirmação antes de substituir o webhook de outro sistema", async () => {
    const { calls } = mockApi({
      "GET /api/whatsapp/status": status({ webhook: elsewhere }),
      "POST /api/whatsapp/webhook": status({ webhook: here }),
    });
    const user = userEvent.setup();
    render(<WhatsappSettings />);

    expect(await screen.findByText("https://n8n.exemplo.com/hook")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Substituir webhook" }));
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Sim, substituir" }));

    expect(calls.at(-1)).toMatchObject({ method: "POST" });
    expect(await screen.findByText("Recebendo mensagens neste portal")).toBeInTheDocument();
  });

  it("mostra o motivo quando o registro é recusado", async () => {
    mockApi({
      "GET /api/whatsapp/status": status(),
      "POST /api/whatsapp/webhook": apiError(
        409,
        "WEBHOOK_URL_NOT_PUBLIC",
        "O webhook precisa de um endereço público com HTTPS. Defina APP_URL com a URL do portal em produção.",
      ),
    });
    const user = userEvent.setup();
    render(<WhatsappSettings />);

    await user.click(await screen.findByRole("button", { name: "Registrar webhook" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("endereço público com HTTPS");
  });

  it("lista as variáveis que faltam quando a integração não foi configurada", async () => {
    mockApi({
      "GET /api/whatsapp/status": {
        body: {
          status: {
            configured: false,
            missing: ["EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_SECRET"],
          },
        },
      },
    });
    render(<WhatsappSettings />);

    expect(await screen.findByText("EVOLUTION_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("EVOLUTION_WEBHOOK_SECRET")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /webhook/i })).not.toBeInTheDocument();
  });

  it("mostra o erro quando a Evolution não responde", async () => {
    mockApi({
      "GET /api/whatsapp/status": apiError(
        502,
        "WHATSAPP_UNAVAILABLE",
        "Não foi possível falar com o WhatsApp agora. Tente novamente.",
      ),
    });
    render(<WhatsappSettings />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível falar");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});
