import type { Database } from "../db/types";
import { NotFoundError } from "../http/errors";
import { type RotationEntry, userModel } from "../models/user.model";

type Deps = { db: Database };

export function createRotationService({ db }: Deps) {
  return {
    /** Vendedores ativos na ordem em que vão receber os próximos leads. */
    list(): Promise<RotationEntry[]> {
      return userModel(db).listRotation();
    },

    /** Coloca ou tira um vendedor da fila do rodízio. */
    async setInRotation(userId: string, inRotation: boolean): Promise<RotationEntry[]> {
      const users = userModel(db);
      const user = await users.findById(userId);
      if (!user || user.role !== "VENDEDOR") {
        throw new NotFoundError("SELLER_NOT_FOUND", "Vendedor não encontrado.");
      }
      await users.setInRotation(userId, inRotation);
      return users.listRotation();
    },
  };
}

export type RotationService = ReturnType<typeof createRotationService>;
