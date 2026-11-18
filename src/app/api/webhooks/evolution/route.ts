import { controllers } from "@/server/container";

/** A resposta da IA de qualificação roda depois do 200 (via `after`) e precisa de folga. */
export const maxDuration = 60;

export const POST = (request: Request) => controllers().webhook.receive(request);
