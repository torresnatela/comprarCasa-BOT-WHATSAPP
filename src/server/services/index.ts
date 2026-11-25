import type { Database } from "../db/types";
import type { LeadQualifier } from "../integrations/anthropic/qualifier";
import type { EvolutionConfig } from "../integrations/evolution/config";
import { createAuthService } from "./auth.service";
import { createCollaboratorService } from "./collaborator.service";
import { createConversationService } from "./conversation.service";
import { createFunnelService } from "./funnel.service";
import { createInviteService } from "./invite.service";
import type { PasswordHasher } from "./password";
import { createQualificationService } from "./qualification.service";
import { createRotationService } from "./rotation.service";
import { createWhatsappService } from "./whatsapp.service";

type Deps = {
  db: Database;
  hasher: PasswordHasher;
  whatsapp: EvolutionConfig;
  appUrl?: string;
  now?: () => Date;
  /** IA de qualificação; nula sem ANTHROPIC_API_KEY. */
  qualifier?: LeadQualifier | null;
  /** Espera antes da IA responder, para juntar mensagens seguidas. */
  qualifierDelayMs?: number;
};

export function createServices({
  whatsapp,
  appUrl,
  qualifier = null,
  qualifierDelayMs = 0,
  ...deps
}: Deps) {
  return {
    auth: createAuthService(deps),
    invites: createInviteService(deps),
    collaborators: createCollaboratorService(deps),
    conversations: createConversationService({
      db: deps.db,
      evolution: whatsapp.client,
    }),
    qualification: createQualificationService({
      db: deps.db,
      evolution: whatsapp.client,
      qualifier,
      appUrl,
      now: deps.now,
      delayMs: qualifierDelayMs,
    }),
    rotation: createRotationService({ db: deps.db }),
    funnel: createFunnelService(deps),
    whatsapp: createWhatsappService({
      evolution: whatsapp.client,
      webhookSecret: whatsapp.webhookSecret,
      missing: whatsapp.missing,
      appUrl,
    }),
  };
}

export type Services = ReturnType<typeof createServices>;
