import { controllers } from "@/server/container";

type Context = RouteContext<"/api/leads/[id]/tarefas/[tarefaId]">;

export const PATCH = (request: Request, context: Context) =>
  controllers().lead.updateTask(request, context);

export const DELETE = (request: Request, context: Context) =>
  controllers().lead.deleteTask(request, context);
