import type { User } from "../db/schema";
import type { Database } from "../db/types";
import { UnauthorizedError } from "../http/errors";
import { sessionModel } from "../models/session.model";
import { userModel } from "../models/user.model";
import type { PasswordHasher } from "./password";
import { generateToken, hashToken } from "./token";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedSession = { token: string; expiresAt: Date };

type Deps = {
  db: Database;
  hasher: PasswordHasher;
  now?: () => Date;
};

/** Cria a sessão no banco (aceita uma transação) e devolve o token em claro. */
export async function issueSession(
  db: Database,
  userId: string,
  now: Date,
): Promise<IssuedSession> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await sessionModel(db).create({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export function createAuthService({ db, hasher, now = () => new Date() }: Deps) {
  const users = userModel(db);
  const sessions = sessionModel(db);

  // Hash usado quando o e-mail não existe, para o tempo de resposta não
  // revelar quais e-mails estão cadastrados.
  let decoyHash: Promise<string> | undefined;

  const invalidCredentials = () =>
    new UnauthorizedError("INVALID_CREDENTIALS", "E-mail ou senha inválidos.");

  return {
    async login(
      email: string,
      password: string,
    ): Promise<{ user: User; session: IssuedSession }> {
      const user = await users.findByEmail(email);
      decoyHash ??= hasher.hash("senha-que-ninguem-usa");
      const matches = await hasher.verify(
        password,
        user?.passwordHash ?? (await decoyHash),
      );

      if (!user || !user.passwordHash || !matches || user.status !== "ATIVO") {
        throw invalidCredentials();
      }
      return { user, session: await issueSession(db, user.id, now()) };
    },

    createSession(userId: string): Promise<IssuedSession> {
      return issueSession(db, userId, now());
    },

    /** Usuário dono de uma sessão válida, ou null. Só usuários ATIVOS passam. */
    async getUserByToken(token: string | undefined): Promise<User | null> {
      if (!token) return null;
      const tokenHash = hashToken(token);
      const session = await sessions.findByTokenHash(tokenHash);
      if (!session) return null;
      if (session.expiresAt.getTime() <= now().getTime()) {
        await sessions.deleteByTokenHash(tokenHash);
        return null;
      }
      const user = await users.findById(session.userId);
      return user?.status === "ATIVO" ? user : null;
    },

    async logout(token: string | undefined): Promise<void> {
      if (token) await sessions.deleteByTokenHash(hashToken(token));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
