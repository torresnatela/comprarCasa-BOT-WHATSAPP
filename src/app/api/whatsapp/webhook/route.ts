import { controllers } from "@/server/container";

export const POST = (request: Request) =>
  controllers().whatsapp.registerWebhook(request);
