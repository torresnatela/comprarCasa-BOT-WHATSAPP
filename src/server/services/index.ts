import type { Database } from "../db/types";
import type { EvolutionConfig } from "../integrations/evolution/config";
import { createAuthService } from "./auth.service";
import { createCollaboratorService } from "./collaborator.service";
import { createConversationService } from "./conversation.service";
import { createInviteService } from "./invite.service";
import type { PasswordHasher } from "./password";
import { createWhatsappService } from "./whatsapp.service";

type Deps = {
  db: Database;
  hasher: PasswordHasher;
  whatsapp: EvolutionConfig;
  appUrl?: string;
  now?: () => Date;
};

export function createServices({ whatsapp, appUrl, ...deps }: Deps) {
  return {
    auth: createAuthService(deps),
    invites: createInviteService(deps),
    collaborators: createCollaboratorService(deps),
    conversations: createConversationService({
      db: deps.db,
      evolution: whatsapp.client,
    }),
    whatsapp: createWhatsappService({
      evolution: whatsapp.client,
      webhookSecret: whatsapp.webhookSecret,
      missing: whatsapp.missing,
      appUrl,
    }),
  };
}

export type Services = ReturnType<typeof createServices>;
