import type { Database } from "../db/types";
import { createAuthService } from "./auth.service";
import { createCollaboratorService } from "./collaborator.service";
import { createInviteService } from "./invite.service";
import type { PasswordHasher } from "./password";

type Deps = { db: Database; hasher: PasswordHasher; now?: () => Date };

export function createServices(deps: Deps) {
  return {
    auth: createAuthService(deps),
    invites: createInviteService(deps),
    collaborators: createCollaboratorService(deps),
  };
}

export type Services = ReturnType<typeof createServices>;
