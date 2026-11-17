import { createGuard } from "../http/guard";
import type { Services } from "../services";
import { createAuthController } from "./auth.controller";
import { createCollaboratorController } from "./collaborator.controller";
import { createInviteController } from "./invite.controller";

type Deps = { services: Services; secureCookies: boolean; appUrl?: string };

export function createControllers({ services, secureCookies, appUrl }: Deps) {
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
  };
}

export type Controllers = ReturnType<typeof createControllers>;
