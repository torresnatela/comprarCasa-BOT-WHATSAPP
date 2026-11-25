import { controllers } from "@/server/container";

export const PATCH = (request: Request, context: RouteContext<"/api/leads/[id]/etapa">) =>
  controllers().lead.changeStage(request, context);
