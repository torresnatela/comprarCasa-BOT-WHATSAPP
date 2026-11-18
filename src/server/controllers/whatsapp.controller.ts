import type { Guard } from "../http/guard";
import { handle, json } from "../http/respond";
import type { WhatsappService } from "../services/whatsapp.service";

type Deps = { guard: Guard; whatsapp: WhatsappService };

const originOf = (request: Request) => new URL(request.url).origin;

export function createWhatsappController({ guard, whatsapp }: Deps) {
  return {
    status: handle(async (request) => {
      await guard.requireRole(request, "GESTOR");
      return json({ status: await whatsapp.status(originOf(request)) });
    }),

    registerWebhook: handle(async (request) => {
      await guard.requireRole(request, "GESTOR");
      return json({ status: await whatsapp.registerWebhook(originOf(request)) });
    }),
  };
}

export type WhatsappController = ReturnType<typeof createWhatsappController>;
