import { controllers } from "@/server/container";

export const PATCH = (request: Request, context: RouteContext<"/api/rodizio/[id]">) =>
  controllers().rotation.update(request, context);
