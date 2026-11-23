import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../tests/fetch-mock";
import "../../tests/router-mock";
import { RotationView } from "./rotation-view";

afterEach(() => vi.unstubAllGlobals());

const ana = {
  id: "u1",
  name: "Ana Souza",
  phone: "5511911112222",
  inRotation: true,
  position: 1,
  lastAssignedAt: null,
  assignedLeads: 0,
};
const bruno = {
  id: "u2",
  name: "Bruno Lima",
  phone: "5511933334444",
  inRotation: true,
  position: 2,
  lastAssignedAt: "2026-11-18T15:00:00.000Z",
  assignedLeads: 3,
};

describe("RotationView", () => {
  it("mostra a fila na ordem, com o próximo destacado", async () => {
    mockApi({ "GET /api/rodizio": { body: { sellers: [ana, bruno] } } });
    render(<RotationView />);

    const fila = await screen.findByRole("list", { name: "Fila do rodízio" });
    const [primeiro, segundo] = within(fila).getAllByRole("listitem");

    expect(within(primeiro).getByText(/Ana Souza/)).toBeInTheDocument();
    expect(within(primeiro).getByText("próximo")).toBeInTheDocument();
    expect(within(segundo).getByText(/3 leads recebidos/)).toBeInTheDocument();
  });

  it("tira um vendedor da fila e mostra a nova ordem", async () => {
    const { calls } = mockApi({
      "GET /api/rodizio": { body: { sellers: [ana, bruno] } },
      "PATCH /api/rodizio/u1": {
        body: {
          sellers: [
            { ...bruno, position: 1 },
            { ...ana, inRotation: false, position: null },
          ],
        },
      },
    });
    render(<RotationView />);

    const [primeiro] = within(await screen.findByRole("list")).getAllByRole("listitem");
    await userEvent.click(within(primeiro).getByRole("button", { name: "Tirar da fila" }));

    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { inRotation: false } });
    expect(await screen.findByRole("button", { name: "Colocar na fila" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fora da fila")).toBeInTheDocument();
  });

  it("avisa quando não há vendedores ativos", async () => {
    mockApi({ "GET /api/rodizio": { body: { sellers: [] } } });
    render(<RotationView />);

    expect(await screen.findByText("Nenhum vendedor ativo")).toBeInTheDocument();
  });

  it("mostra o erro do servidor", async () => {
    mockApi({ "GET /api/rodizio": apiError(403, "FORBIDDEN", "Sem permissão.") });
    render(<RotationView />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão.");
  });
});
