import { controllers } from "@/server/container";

export const GET = (request: Request) => controllers().rotation.list(request);
