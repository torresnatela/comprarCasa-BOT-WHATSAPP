import {
  clearedSessionCookie,
  readSessionToken,
  sessionCookie,
} from "../http/cookies";
import { UnauthorizedError } from "../http/errors";
import { handle, json, parseBody } from "../http/respond";
import type { AuthService } from "../services/auth.service";
import { loginSchema } from "../validation/schemas";
import { toPublicUser } from "./presenters";

type Deps = { auth: AuthService; secureCookies: boolean };

export function createAuthController({ auth, secureCookies }: Deps) {
  const cookieOptions = { secure: secureCookies };

  return {
    login: handle(async (request) => {
      const { email, password } = await parseBody(request, loginSchema);
      const { user, session } = await auth.login(email, password);
      return json(
        { user: toPublicUser(user) },
        {
          headers: {
            "set-cookie": sessionCookie(
              session.token,
              session.expiresAt,
              cookieOptions,
            ),
          },
        },
      );
    }),

    logout: handle(async (request) => {
      await auth.logout(readSessionToken(request));
      return new Response(null, {
        status: 204,
        headers: { "set-cookie": clearedSessionCookie(cookieOptions) },
      });
    }),

    me: handle(async (request) => {
      const user = await auth.getUserByToken(readSessionToken(request));
      if (!user) throw new UnauthorizedError();
      return json({ user: toPublicUser(user) });
    }),
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
