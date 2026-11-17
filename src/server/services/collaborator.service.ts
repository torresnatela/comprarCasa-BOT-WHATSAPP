import type { User } from "../db/schema";
import type { Database } from "../db/types";
import { ConflictError, NotFoundError } from "../http/errors";
import { inviteModel } from "../models/invite.model";
import { sessionModel } from "../models/session.model";
import { userModel, type UserPatch } from "../models/user.model";
import type {
  CreateCollaboratorInput,
  UpdateCollaboratorInput,
} from "../validation/schemas";
import { type IssuedInvite, issueInvite } from "./invite.service";

type Deps = {
  db: Database;
  now?: () => Date;
};

const isActiveManager = (user: Pick<User, "role" | "status">) =>
  user.role === "GESTOR" && user.status === "ATIVO";

export function createCollaboratorService({ db, now = () => new Date() }: Deps) {
  return {
    list(): Promise<User[]> {
      return userModel(db).list();
    },

    /** Cadastra o colaborador (PENDENTE, sem senha) já com o convite de acesso. */
    create(
      input: CreateCollaboratorInput,
      actor: User,
    ): Promise<{ user: User; invite: IssuedInvite }> {
      return db.transaction(async (tx) => {
        const user = await userModel(tx).create(input);
        const invite = await issueInvite(tx, user.id, actor.id, now());
        return { user, invite };
      });
    },

    async update(
      id: string,
      { active, ...fields }: UpdateCollaboratorInput,
      actor: User,
    ): Promise<User> {
      return db.transaction(async (tx) => {
        const users = userModel(tx);
        const current = await users.findById(id);
        if (!current) throw new NotFoundError();

        const patch: UserPatch = { ...fields };
        if (active === false && current.status !== "INATIVO") {
          if (current.id === actor.id) {
            throw new ConflictError(
              "CANNOT_DEACTIVATE_SELF",
              "Você não pode desativar a própria conta.",
            );
          }
          patch.status = "INATIVO";
        } else if (active === true && current.status === "INATIVO") {
          patch.status = current.passwordHash ? "ATIVO" : "PENDENTE";
        }

        const next = { ...current, ...patch };
        if (
          isActiveManager(current) &&
          !isActiveManager(next) &&
          (await users.countActiveGestores()) <= 1
        ) {
          throw new ConflictError(
            "LAST_MANAGER",
            "O portal precisa de pelo menos um gestor ativo.",
          );
        }

        const updated = await users.update(id, patch);
        if (!updated) throw new NotFoundError();

        if (patch.status === "INATIVO") {
          await sessionModel(tx).deleteByUserId(id);
          await inviteModel(tx).deleteUnusedByUserId(id);
        }
        return updated;
      });
    },
  };
}

export type CollaboratorService = ReturnType<typeof createCollaboratorService>;
