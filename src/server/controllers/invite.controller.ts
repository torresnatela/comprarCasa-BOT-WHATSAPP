import { sessionCookie } from "../http/cookies";
import { handle, json, parseBody } from "../http/respond";
import type { InviteService } from "../services/invite.service";
import { acceptInviteSchema } from "../validation/schemas";
import { toPublicUser } from "./presenters";

type Deps = { invites: InviteService; secureCookies: boolean };
type TokenContext = { params: Promise<{ token: string }> };

/** Rotas públicas: quem tem o link ainda não tem conta ativa. */
export function createInviteController({ invites, secureCookies }: Deps) {
  return {
    show: handle(async (_request, { params }: TokenContext) => {
      const { invite, user } = await invites.inspect((await params).token);
      return json({
        invite: {
          name: user.name,
          email: user.email,
          expiresAt: invite.expiresAt.toISOString(),
        },
      });
    }),

    accept: handle(async (request, { params }: TokenContext) => {
      const { password } = await parseBody(request, acceptInviteSchema);
      const { user, session } = await invites.accept(
        (await params).token,
        password,
      );
      return json(
        { user: toPublicUser(user) },
        {
          headers: {
            "set-cookie": sessionCookie(session.token, session.expiresAt, {
              secure: secureCookies,
            }),
          },
        },
      );
    }),
  };
}

export type InviteController = ReturnType<typeof createInviteController>;
