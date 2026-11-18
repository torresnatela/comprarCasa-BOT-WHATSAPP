import { createGuard } from "../http/guard";
import type { EvolutionConfig } from "../integrations/evolution/config";
import type { Services } from "../services";
import { createAuthController } from "./auth.controller";
import { createCollaboratorController } from "./collaborator.controller";
import { createInviteController } from "./invite.controller";
import { createLeadController } from "./lead.controller";
import { createWebhookController } from "./webhook.controller";
import { createWhatsappController } from "./whatsapp.controller";

type Deps = {
  services: Services;
  secureCookies: boolean;
  whatsapp: Pick<EvolutionConfig, "webhookSecret" | "instance">;
  appUrl?: string;
};

export function createControllers({
  services,
  secureCookies,
  whatsapp,
  appUrl,
}: Deps) {
  const guard = createGuard(services.auth);
  return {
    auth: createAuthController({ auth: services.auth, secureCookies }),
    collaborator: createCollaboratorController({
      guard,
      collaborators: services.collaborators,
      invites: services.invites,
      appUrl,
    }),
    invite: createInviteController({ invites: services.invites, secureCookies }),
    lead: createLeadController({ guard, conversations: services.conversations }),
    whatsapp: createWhatsappController({ guard, whatsapp: services.whatsapp }),
    webhook: createWebhookController({
      conversations: services.conversations,
      webhookSecret: whatsapp.webhookSecret,
      instance: whatsapp.instance,
    }),
  };
}

export type Controllers = ReturnType<typeof createControllers>;
