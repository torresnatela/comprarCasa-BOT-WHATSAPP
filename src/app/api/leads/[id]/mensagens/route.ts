import { controllers } from "@/server/container";

export const POST = (
  request: Request,
  context: RouteContext<"/api/leads/[id]/mensagens">,
) => controllers().lead.reply(request, context);
