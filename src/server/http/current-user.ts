import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { leadScope } from "@/lib/access";
import type { UserRole } from "@/lib/roles";
import { services } from "../container";
import { type PublicUser, toPublicUser } from "../controllers/presenters";
import { SESSION_COOKIE } from "./cookies";

/**
 * Usuário da sessão atual para páginas e layouts (Server Components).
 * `cache` evita consultar o banco mais de uma vez na mesma requisição.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await services().auth.getUserByToken(token);
  return user ? toPublicUser(user) : null;
});

/** Exige login; sem sessão válida, manda para a tela de login. */
export async function requirePageUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige um dos papéis; quem não tem volta para o início do portal. */
export async function requirePageRole(...roles: UserRole[]): Promise<PublicUser> {
  const user = await requirePageUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/** Exige acesso às mensagens (gestor ou vendedor com acesso); sem ele, volta ao início. */
export async function requirePageLeadAccess(): Promise<PublicUser> {
  const user = await requirePageUser();
  if (leadScope(user) === "NONE") redirect("/");
  return user;
}
