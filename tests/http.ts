import { SESSION_COOKIE } from "@/server/http/cookies";

const ORIGIN = "http://localhost:3000";

type RequestOptions = {
  body?: unknown;
  /** Token de sessão enviado no cookie. */
  session?: string;
  headers?: Record<string, string>;
};

/** Monta uma Request como a que o Next entrega aos route handlers. */
export function apiRequest(
  method: string,
  path: string,
  { body, session, headers = {} }: RequestOptions = {},
): Request {
  const allHeaders = new Headers(headers);
  if (session) allHeaders.set("cookie", `${SESSION_COOKIE}=${session}`);
  if (body !== undefined) allHeaders.set("content-type", "application/json");
  if (method !== "GET" && !allHeaders.has("origin")) {
    allHeaders.set("origin", ORIGIN);
  }
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: allHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Extrai o valor do cookie de sessão de uma resposta (ou null). */
export function sessionFromResponse(response: Response): string | null {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`));
  return match?.[1] || null;
}
