import { NotFoundError } from "../http/errors";
import type { Guard } from "../http/guard";
import { handle, json, parseBody } from "../http/respond";
import type { CollaboratorService } from "../services/collaborator.service";
import type { InviteService, IssuedInvite } from "../services/invite.service";
import {
  createCollaboratorSchema,
  idSchema,
  updateCollaboratorSchema,
} from "../validation/schemas";
import { toPublicUser } from "./presenters";

type Deps = {
  guard: Guard;
  collaborators: CollaboratorService;
  invites: InviteService;
  /** URL pública do portal; sem ela, usa a origem da própria requisição. */
  appUrl?: string;
};

type IdContext = { params: Promise<{ id: string }> };

async function readId({ params }: IdContext): Promise<string> {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

export function createCollaboratorController({
  guard,
  collaborators,
  invites,
  appUrl,
}: Deps) {
  function presentInvite(request: Request, invite: IssuedInvite) {
    const base = (appUrl || new URL(request.url).origin).replace(/\/+$/, "");
    return {
      url: `${base}/convite/${invite.token}`,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  return {
    list: handle(async (request) => {
      await guard.requireRole(request, "GESTOR");
      const users = await collaborators.list();
      return json({ collaborators: users.map(toPublicUser) });
    }),

    create: handle(async (request) => {
      const actor = await guard.requireRole(request, "GESTOR");
      const input = await parseBody(request, createCollaboratorSchema);
      const { user, invite } = await collaborators.create(input, actor);
      return json(
        {
          collaborator: toPublicUser(user),
          invite: presentInvite(request, invite),
        },
        { status: 201 },
      );
    }),

    update: handle(async (request, context: IdContext) => {
      const actor = await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const input = await parseBody(request, updateCollaboratorSchema);
      const user = await collaborators.update(id, input, actor);
      return json({ collaborator: toPublicUser(user) });
    }),

    regenerateInvite: handle(async (request, context: IdContext) => {
      const actor = await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const invite = await invites.createFor(id, actor.id);
      return json({ invite: presentInvite(request, invite) }, { status: 201 });
    }),
  };
}

export type CollaboratorController = ReturnType<
  typeof createCollaboratorController
>;
