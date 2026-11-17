export const SESSION_COOKIE = "session";

type CookieOptions = { secure: boolean };

/** Lê o token de sessão do cabeçalho Cookie de uma Request. */
export function readSessionToken(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      return part.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

function serialize(value: string, attributes: string[], { secure }: CookieOptions) {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...attributes,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function sessionCookie(
  token: string,
  expiresAt: Date,
  options: CookieOptions,
): string {
  return serialize(token, [`Expires=${expiresAt.toUTCString()}`], options);
}

export function clearedSessionCookie(options: CookieOptions): string {
  return serialize("", ["Max-Age=0"], options);
}
