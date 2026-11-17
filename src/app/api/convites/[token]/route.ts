import { controllers } from "@/server/container";

export const GET = (
  request: Request,
  context: RouteContext<"/api/convites/[token]">,
) => controllers().invite.show(request, context);

export const POST = (
  request: Request,
  context: RouteContext<"/api/convites/[token]">,
) => controllers().invite.accept(request, context);
