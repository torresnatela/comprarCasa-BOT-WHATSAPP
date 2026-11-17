import type { User, UserRole } from "../db/schema";
import type { AuthService } from "../services/auth.service";
import { readSessionToken } from "./cookies";
import { ForbiddenError, UnauthorizedError } from "./errors";

/** Autenticação e autorização das rotas da API. */
export function createGuard(auth: Pick<AuthService, "getUserByToken">) {
  async function requireUser(request: Request): Promise<User> {
    const user = await auth.getUserByToken(readSessionToken(request));
    if (!user) throw new UnauthorizedError();
    return user;
  }

  async function requireRole(request: Request, ...roles: UserRole[]): Promise<User> {
    const user = await requireUser(request);
    if (!roles.includes(user.role)) throw new ForbiddenError();
    return user;
  }

  return { requireUser, requireRole };
}

export type Guard = ReturnType<typeof createGuard>;
