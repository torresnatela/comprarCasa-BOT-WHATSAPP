import { vi } from "vitest";

type Reply = { status?: number; body?: unknown };
type Route = Reply | ((init: { body: unknown }) => Reply);

/**
 * Substitui o fetch global por respostas fixas por "MÉTODO /caminho".
 * Devolve as chamadas feitas, para os testes conferirem o que foi enviado.
 */
export function mockApi(routes: Record<string, Route>) {
  const calls: { method: string; path: string; body: unknown }[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });

    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Chamada não prevista no teste: ${method} ${path}`);
    const { status = 200, body: responseBody } =
      typeof route === "function" ? route({ body }) : route;
    return new Response(
      responseBody === undefined ? null : JSON.stringify(responseBody),
      { status, headers: { "content-type": "application/json" } },
    );
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

export const apiError = (
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): Reply => ({ status, body: { error: { code, message, fields } } });
