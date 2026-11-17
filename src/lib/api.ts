export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = { method?: string; body?: unknown };

/** Cliente das rotas `/api` usado pelas telas. Erros viram `ApiError`. */
export async function api<T = void>(
  path: string,
  { method = "GET", body }: Options = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK",
      "Não foi possível conectar. Verifique sua internet e tente de novo.",
    );
  }

  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? "Algo deu errado. Tente novamente.",
      error?.fields,
    );
  }
  return payload as T;
}

/** Mensagem de qualquer erro, pronta para mostrar na tela. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Algo deu errado. Tente novamente.";
}
