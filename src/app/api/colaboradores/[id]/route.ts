import { controllers } from "@/server/container";

export const PATCH = (
  request: Request,
  context: RouteContext<"/api/colaboradores/[id]">,
) => controllers().collaborator.update(request, context);
