import { controllers } from "@/server/container";

export const POST = (request: Request, context: RouteContext<"/api/leads/[id]/tarefas">) =>
  controllers().lead.createTask(request, context);
