import { controllers } from "@/server/container";

export const GET = (request: Request) =>
  controllers().collaborator.list(request);

export const POST = (request: Request) =>
  controllers().collaborator.create(request);
