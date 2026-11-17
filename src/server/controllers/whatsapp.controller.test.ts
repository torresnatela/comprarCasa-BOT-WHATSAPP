import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, WEBHOOK_SECRET } from "../../../tests/app";
import { INSTANCE } from "../../../tests/evolution-fixtures";
import { createUser } from "../../../tests/factories";
import { apiRequest } from "../../../tests/http";
import { createTestDb, type TestDb } from "../../../tests/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const PORTAL = "https://portal.imobiliaria.com";

async function setup(
  role: "GESTOR" | "VENDEDOR" = "GESTOR",
  /** `null` simula o portal sem APP_URL (cai na origem da requisição, localhost). */
  appUrl: string | null = PORTAL,
  options: { whatsappConfigured?: boolean } = {},
) {
  const app = createTestApp(testDb.db, appUrl ?? undefined, options);
  const actor = await createUser(testDb.db, { role });
  const { token } = await app.services.auth.createSession(actor.id);
  return { ...app, session: token };
}

describe("GET /api/whatsapp/status", () => {
  it("mostra a instância conectada e o endereço esperado do webhook", async () => {
    const { controllers, session } = await setup();

    const response = await controllers.whatsapp.status(
      apiRequest("GET", "/api/whatsapp/status", { session }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: {
        configured: true,
        instance: INSTANCE,
        connected: true,
        webhookUrl: `${PORTAL}/api/webhooks/evolution`,
        webhook: null,
      },
    });
  });

  it("lista o que falta configurar, sem expor valores", async () => {
    const { controllers, session } = await setup("GESTOR", PORTAL, {
      whatsappConfigured: false,
    });

    const response = await controllers.whatsapp.status(
      apiRequest("GET", "/api/whatsapp/status", { session }),
    );

    expect(await response.json()).toEqual({
      status: {
        configured: false,
        missing: ["EVOLUTION_API_URL", "EVOLUTION_WEBHOOK_SECRET"],
      },
    });
  });

  it("responde 403 para vendedor", async () => {
    const { controllers, session } = await setup("VENDEDOR");

    const response = await controllers.whatsapp.status(
      apiRequest("GET", "/api/whatsapp/status", { session }),
    );

    expect(response.status).toBe(403);
  });
});

describe("POST /api/whatsapp/webhook", () => {
  it("registra o webhook do portal na Evolution, sem devolver o segredo", async () => {
    const { controllers, evolution, session } = await setup();

    const response = await controllers.whatsapp.registerWebhook(
      apiRequest("POST", "/api/whatsapp/webhook", { session }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(evolution.registered).toEqual([
      { url: `${PORTAL}/api/webhooks/evolution`, secret: WEBHOOK_SECRET },
    ]);
    expect(JSON.parse(text).status.webhook).toMatchObject({ pointsHere: true });
    expect(text).not.toContain(WEBHOOK_SECRET);
  });

  it("responde 409 quando o portal não tem endereço público", async () => {
    const { controllers, evolution, session } = await setup("GESTOR", null);

    const response = await controllers.whatsapp.registerWebhook(
      apiRequest("POST", "/api/whatsapp/webhook", { session }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("WEBHOOK_URL_NOT_PUBLIC");
    expect(evolution.registered).toEqual([]);
  });

  it("responde 403 para vendedor", async () => {
    const { controllers, evolution, session } = await setup("VENDEDOR");

    const response = await controllers.whatsapp.registerWebhook(
      apiRequest("POST", "/api/whatsapp/webhook", { session }),
    );

    expect(response.status).toBe(403);
    expect(evolution.registered).toEqual([]);
  });
});
