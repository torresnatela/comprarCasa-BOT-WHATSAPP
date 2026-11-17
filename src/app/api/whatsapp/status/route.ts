import { controllers } from "@/server/container";

export const GET = (request: Request) => controllers().whatsapp.status(request);
