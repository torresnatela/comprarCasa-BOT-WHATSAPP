import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/http/cookies";

/**
 * Atalho de navegação: sem cookie de sessão, vai direto para o login.
 * Não é a barreira de segurança — a sessão é validada no servidor em
 * cada página do portal e em cada rota da API.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // Tudo, menos API, telas públicas e arquivos estáticos.
    "/((?!api|login|convite|_next/static|_next/image|favicon.ico).*)",
  ],
};
