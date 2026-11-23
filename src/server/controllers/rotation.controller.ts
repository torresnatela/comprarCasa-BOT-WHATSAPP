import { NotFoundError } from "../http/errors";
import type { Guard } from "../http/guard";
import { handle, json, parseBody } from "../http/respond";
import type { RotationService } from "../services/rotation.service";
import { idSchema, rotationUpdateSchema } from "../validation/schemas";
import { toPublicRotation } from "./presenters";

type Deps = {
  guard: Guard;
  rotation: RotationService;
};

type IdContext = { params: Promise<{ id: string }> };

/** Fila do rodízio de leads: só o gestor vê e mexe. */
export function createRotationController({ guard, rotation }: Deps) {
  return {
    list: handle(async (request) => {
      await guard.requireRole(request, "GESTOR");
      return json({ sellers: toPublicRotation(await rotation.list()) });
    }),

    update: handle(async (request, { params }: IdContext) => {
      await guard.requireRole(request, "GESTOR");
      const id = idSchema.safeParse((await params).id);
      if (!id.success) throw new NotFoundError("SELLER_NOT_FOUND", "Vendedor não encontrado.");
      const { inRotation } = await parseBody(request, rotationUpdateSchema);
      return json({ sellers: toPublicRotation(await rotation.setInRotation(id.data, inRotation)) });
    }),
  };
}

export type RotationController = ReturnType<typeof createRotationController>;
