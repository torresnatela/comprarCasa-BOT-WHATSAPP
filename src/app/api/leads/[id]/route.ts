import { controllers } from "@/server/container";

export const GET = (request: Request, context: RouteContext<"/api/leads/[id]">) =>
  controllers().lead.show(request, context);
