import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, routeParams } from "../../../tests/app";
import { createUser } from "../../../tests/factories";
import { apiRequest } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

async function loginAs(app: ReturnType<typeof createTestApp>, user: { id: string }) {
  const { token: session } = await app.services.auth.createSession(user.id);
  return (method: string, path: string, body?: unknown) =>
    apiRequest(method, path, { session, body });
}

describe("/api/rodizio", () => {
  it("gestor vê a fila e tira um vendedor dela", async () => {
    const app = createTestApp(testDb.db);
    const gestor = await createUser(testDb.db, { role: "GESTOR" });
    const ana = await createUser(testDb.db, { name: "Ana" });
    const bruno = await createUser(testDb.db, { name: "Bruno" });
    const request = await loginAs(app, gestor);

    const list = await app.controllers.rotation.list(request("GET", "/api/rodizio"));
    expect((await list.json()).sellers.map((s: { name: string }) => s.name)).toEqual(["Ana", "Bruno"]);

    const updated = await app.controllers.rotation.update(
      request("PATCH", `/api/rodizio/${ana.id}`, { inRotation: false }),
      routeParams({ id: ana.id }),
    );
    expect((await updated.json()).sellers).toMatchObject([
      { id: bruno.id, inRotation: true, position: 1 },
      { id: ana.id, inRotation: false, position: null },
    ]);
  });

  it("vendedor não acessa a fila", async () => {
    const app = createTestApp(testDb.db);
    const vendedor = await createUser(testDb.db);
    const request = await loginAs(app, vendedor);

    const response = await app.controllers.rotation.list(request("GET", "/api/rodizio"));

    expect(response.status).toBe(403);
  });
});
