import { controllers } from "@/server/container";

export const POST = (
  request: Request,
  context: RouteContext<"/api/colaboradores/[id]/convite">,
) => controllers().collaborator.regenerateInvite(request, context);
