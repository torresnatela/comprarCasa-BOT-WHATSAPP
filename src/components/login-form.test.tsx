import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import { router } from "../../tests/router-mock";
import { LoginForm } from "./login-form";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(<LoginForm />);
  await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
  await user.type(screen.getByLabelText("Senha"), "senha-correta");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("envia as credenciais e vai para o portal", async () => {
    const { calls } = mockApi({
      "POST /api/auth/login": { body: { user: { id: "1" } } },
    });

    await fillAndSubmit();

    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/auth/login",
        body: { email: "ana@exemplo.com", password: "senha-correta" },
      },
    ]);
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("mostra o erro do servidor e continua na tela", async () => {
    mockApi({
      "POST /api/auth/login": apiError(
        401,
        "INVALID_CREDENTIALS",
        "E-mail ou senha inválidos.",
      ),
    });

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "E-mail ou senha inválidos.",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("mostra erros de validação ao lado do campo", async () => {
    mockApi({
      "POST /api/auth/login": apiError(400, "VALIDATION", "Dados inválidos.", {
        email: "E-mail inválido.",
      }),
    });

    await fillAndSubmit();

    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
  });
});
