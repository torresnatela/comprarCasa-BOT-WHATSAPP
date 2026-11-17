import { controllers } from "@/server/container";

export const POST = (request: Request) => controllers().auth.login(request);
