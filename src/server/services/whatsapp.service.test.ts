import { describe, expect, it } from "vitest";
import { INSTANCE } from "../../../tests/evolution-fixtures";
import { createFakeEvolution } from "../../../tests/fake-evolution";
import { createWhatsappService } from "./whatsapp.service";

const ORIGIN = "https://portal.imobiliaria.com";
const HOOK = `${ORIGIN}/api/webhooks/evolution`;

function setup(overrides: Partial<Parameters<typeof createWhatsappService>[0]> = {}) {
  const evolution = createFakeEvolution();
  const service = createWhatsappService({
    evolution: evolution.client,
    webhookSecret: "segredo-do-webhook",
    missing: [],
    ...overrides,
  });
  return { service, evolution: evolution.state };
}

describe("whatsappService.status", () => {
  it("mostra instância conectada e ainda sem webhook", async () => {
    const { service } = setup();

    expect(await service.status(ORIGIN)).toEqual({
      configured: true,
      instance: INSTANCE,
      connected: true,
      webhookUrl: HOOK,
      webhook: null,
    });
  });

  it("indica quando o webhook registrado aponta para este portal", async () => {
    const { service, evolution } = setup();
    evolution.webhook = { url: HOOK, enabled: true, events: ["MESSAGES_UPSERT"] };

    const status = await service.status(ORIGIN);

    expect(status).toMatchObject({ webhook: { url: HOOK, enabled: true, pointsHere: true } });
  });

  it("indica quando o webhook registrado é de outro sistema", async () => {
    const { service, evolution } = setup();
    evolution.webhook = { url: "https://n8n.exemplo.com/hook", enabled: true, events: [] };

    const status = await service.status(ORIGIN);

    expect(status).toMatchObject({ webhook: { pointsHere: false } });
  });

  it("indica instância desconectada", async () => {
    const { service, evolution } = setup();
    evolution.connection = "close";

    expect(await service.status(ORIGIN)).toMatchObject({ connected: false });
  });

  it("usa APP_URL, quando definida, para montar o endereço do webhook", async () => {
    const { service } = setup({ appUrl: "https://app.imobiliaria.com/" });

    expect(await service.status(ORIGIN)).toMatchObject({
      webhookUrl: "https://app.imobiliaria.com/api/webhooks/evolution",
    });
  });

  it("lista as variáveis que faltam quando não está configurado", async () => {
    const { service } = setup({
      evolution: null,
      webhookSecret: null,
      missing: ["EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_SECRET"],
    });

    expect(await service.status(ORIGIN)).toEqual({
      configured: false,
      missing: ["EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_SECRET"],
    });
  });
});

describe("whatsappService.registerWebhook", () => {
  it("registra o endereço do portal com o segredo e devolve o novo status", async () => {
    const { service, evolution } = setup();

    const status = await service.registerWebhook(ORIGIN);

    expect(evolution.registered).toEqual([{ url: HOOK, secret: "segredo-do-webhook" }]);
    expect(status).toMatchObject({ webhook: { url: HOOK, pointsHere: true } });
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://portal.imobiliaria.com"])(
    "recusa endereço que a Evolution não alcança ou sem HTTPS: %s",
    async (origin) => {
      const { service, evolution } = setup();

      await expect(service.registerWebhook(origin)).rejects.toMatchObject({
        status: 409,
        code: "WEBHOOK_URL_NOT_PUBLIC",
      });
      expect(evolution.registered).toEqual([]);
    },
  );

  it("avisa quando não está configurado", async () => {
    const { service } = setup({ evolution: null, missing: ["EVOLUTION_API_URL"] });

    await expect(service.registerWebhook(ORIGIN)).rejects.toMatchObject({
      status: 503,
      code: "WHATSAPP_NOT_CONFIGURED",
    });
  });
});
