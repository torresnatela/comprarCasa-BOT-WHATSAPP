import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import { router } from "../../tests/router-mock";
import { AcceptInviteForm } from "./accept-invite-form";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const validInvite = {
  body: {
    invite: {
      name: "Bia Lima",
      email: "bia@exemplo.com",
      expiresAt: "2026-11-24T12:00:00.000Z",
    },
  },
};

async function fill(password: string, confirmation: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Crie sua senha"), password);
  await user.type(screen.getByLabelText("Repita a senha"), confirmation);
  await user.click(screen.getByRole("button", { name: "Criar senha e entrar" }));
}

describe("AcceptInviteForm", () => {
  it("mostra para quem é o convite", async () => {
    mockApi({ "GET /api/convites/tok123": validInvite });

    render(<AcceptInviteForm token="tok123" />);

    expect(await screen.findByText(/Olá, Bia Lima/)).toBeInTheDocument();
    expect(screen.getByText("bia@exemplo.com")).toBeInTheDocument();
  });

  it("explica o problema e esconde o formulário quando o link é inválido", async () => {
    mockApi({
      "GET /api/convites/velho": apiError(
        410,
        "INVITE_EXPIRED",
        "Este link de convite expirou. Peça um novo ao gestor.",
      ),
    });

    render(<AcceptInviteForm token="velho" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este link de convite expirou. Peça um novo ao gestor.",
    );
    expect(screen.queryByLabelText("Crie sua senha")).not.toBeInTheDocument();
  });

  it("não envia quando as senhas são diferentes", async () => {
    const { calls } = mockApi({ "GET /api/convites/tok123": validInvite });
    render(<AcceptInviteForm token="tok123" />);

    await fill("minha-senha-nova", "outra-coisa");

    expect(screen.getByText("As senhas não são iguais.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("define a senha e entra no portal", async () => {
    const { calls } = mockApi({
      "GET /api/convites/tok123": validInvite,
      "POST /api/convites/tok123": { body: { user: { id: "1" } } },
    });
    render(<AcceptInviteForm token="tok123" />);

    await fill("minha-senha-nova", "minha-senha-nova");

    expect(calls.at(-1)).toEqual({
      method: "POST",
      path: "/api/convites/tok123",
      body: { password: "minha-senha-nova" },
    });
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("mostra o erro de senha fraca vindo do servidor", async () => {
    mockApi({
      "GET /api/convites/tok123": validInvite,
      "POST /api/convites/tok123": apiError(400, "VALIDATION", "Dados inválidos.", {
        password: "A senha deve ter pelo menos 8 caracteres.",
      }),
    });
    render(<AcceptInviteForm token="tok123" />);

    await fill("curta", "curta");

    expect(
      await screen.findByText("A senha deve ter pelo menos 8 caracteres."),
    ).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
