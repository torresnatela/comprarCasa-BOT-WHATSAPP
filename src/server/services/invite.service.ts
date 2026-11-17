import type { Invite, User } from "../db/schema";
import type { Database } from "../db/types";
import { ConflictError, GoneError, NotFoundError } from "../http/errors";
import { inviteModel } from "../models/invite.model";
import { sessionModel } from "../models/session.model";
import { userModel } from "../models/user.model";
import { type IssuedSession, issueSession } from "./auth.service";
import type { PasswordHasher } from "./password";
import { generateToken, hashToken } from "./token";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedInvite = { token: string; expiresAt: Date };

type Deps = {
  db: Database;
  hasher: PasswordHasher;
  now?: () => Date;
};

/**
 * Gera um convite novo e invalida os anteriores ainda não usados.
 * Aceita uma transação, para ser chamado junto com a criação do usuário.
 */
export async function issueInvite(
  db: Database,
  userId: string,
  createdBy: string,
  now: Date,
): Promise<IssuedInvite> {
  const invites = inviteModel(db);
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await invites.deleteUnusedByUserId(userId);
  await invites.create({ tokenHash: hashToken(token), userId, createdBy, expiresAt });
  return { token, expiresAt };
}

const notFound = () =>
  new GoneError("INVITE_NOT_FOUND", "Este link de convite não é válido.");

export function createInviteService({ db, hasher, now = () => new Date() }: Deps) {
  async function inspect(token: string): Promise<{ invite: Invite; user: User }> {
    const invite = await inviteModel(db).findByTokenHash(hashToken(token));
    if (!invite) throw notFound();
    if (invite.usedAt) {
      throw new GoneError("INVITE_USED", "Este link de convite já foi utilizado.");
    }
    if (invite.expiresAt.getTime() <= now().getTime()) {
      throw new GoneError(
        "INVITE_EXPIRED",
        "Este link de convite expirou. Peça um novo ao gestor.",
      );
    }
    const user = await userModel(db).findById(invite.userId);
    if (!user || user.status === "INATIVO") throw notFound();
    return { invite, user };
  }

  return {
    inspect,

    async createFor(userId: string, createdBy: string): Promise<IssuedInvite> {
      const user = await userModel(db).findById(userId);
      if (!user) throw new NotFoundError();
      if (user.status === "INATIVO") {
        throw new ConflictError(
          "USER_INACTIVE",
          "Reative o colaborador antes de gerar um link de acesso.",
        );
      }
      return db.transaction((tx) => issueInvite(tx, userId, createdBy, now()));
    },

    /** Define a senha do convidado, ativa a conta e já abre uma sessão. */
    async accept(
      token: string,
      password: string,
    ): Promise<{ user: User; session: IssuedSession }> {
      const { invite } = await inspect(token);
      const passwordHash = await hasher.hash(password);

      return db.transaction(async (tx) => {
        const claimed = await inviteModel(tx).markUsed(invite.id, now());
        if (!claimed) {
          throw new GoneError(
            "INVITE_USED",
            "Este link de convite já foi utilizado.",
          );
        }
        const user = await userModel(tx).update(invite.userId, {
          passwordHash,
          status: "ATIVO",
        });
        if (!user) throw notFound();
        await sessionModel(tx).deleteByUserId(user.id);
        return { user, session: await issueSession(tx, user.id, now()) };
      });
    },
  };
}

export type InviteService = ReturnType<typeof createInviteService>;
