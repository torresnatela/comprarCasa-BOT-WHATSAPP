import { controllers } from "@/server/container";

export const PATCH = (
  request: Request,
  context: RouteContext<"/api/leads/[id]/automacao">,
) => controllers().lead.setAutomation(request, context);
