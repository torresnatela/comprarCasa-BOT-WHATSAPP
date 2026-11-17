import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../../../tests/factories";
import { fastHasher } from "../../../tests/hasher";
import { apiRequest } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";
import { createAuthService } from "../services/auth.service";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { createGuard } from "./guard";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

async function setup(role: "GESTOR" | "VENDEDOR") {
  const auth = createAuthService({ db: testDb.db, hasher: fastHasher });
  const user = await createUser(testDb.db, { role });
  const session = await auth.createSession(user.id);
  return { guard: createGuard(auth), user, session: session.token };
}

describe("guard.requireUser", () => {
  it("lança UnauthorizedError sem cookie de sessão", async () => {
    const { guard } = await setup("VENDEDOR");

    await expect(
      guard.requireUser(apiRequest("GET", "/api/qualquer")),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lança UnauthorizedError com sessão inválida", async () => {
    const { guard } = await setup("VENDEDOR");

    await expect(
      guard.requireUser(apiRequest("GET", "/api/qualquer", { session: "falso" })),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("devolve o usuário autenticado", async () => {
    const { guard, user, session } = await setup("VENDEDOR");

    const found = await guard.requireUser(
      apiRequest("GET", "/api/qualquer", { session }),
    );

    expect(found.id).toBe(user.id);
  });
});

describe("guard.requireRole", () => {
  it("lança ForbiddenError quando o papel não é permitido", async () => {
    const { guard, session } = await setup("VENDEDOR");

    await expect(
      guard.requireRole(apiRequest("GET", "/api/x", { session }), "GESTOR"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lança UnauthorizedError (e não Forbidden) sem sessão", async () => {
    const { guard } = await setup("GESTOR");

    await expect(
      guard.requireRole(apiRequest("GET", "/api/x"), "GESTOR"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("devolve o usuário quando o papel é permitido", async () => {
    const { guard, user, session } = await setup("GESTOR");

    const found = await guard.requireRole(
      apiRequest("GET", "/api/x", { session }),
      "GESTOR",
    );

    expect(found.id).toBe(user.id);
  });
});
