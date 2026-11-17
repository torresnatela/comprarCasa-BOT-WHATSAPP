/**
 * Payloads no formato que a Evolution API 2.3.7 entrega ao webhook
 * (conferido no código-fonte: webhook.controller.ts e prepareMessage).
 */
type MessageOverrides = {
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  fromMe?: boolean;
  pushName?: string | null;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number;
  instance?: string;
  event?: string;
};

export const INSTANCE = "Comprarcasa Teste";

export function upsertPayload({
  id = "3EB0A1B2C3D4E5F6",
  remoteJid = "351912345678@s.whatsapp.net",
  remoteJidAlt,
  fromMe = false,
  pushName = "Maria Silva",
  message = { conversation: "Olá, vi o anúncio do T2 em Caldas" },
  messageType = "conversation",
  messageTimestamp = 1794880000,
  instance = INSTANCE,
  event = "messages.upsert",
}: MessageOverrides = {}) {
  return {
    event,
    instance,
    data: {
      key: { remoteJid, fromMe, id, ...(remoteJidAlt && { remoteJidAlt }) },
      pushName,
      status: "DELIVERY_ACK",
      message,
      messageType,
      messageTimestamp,
      instanceId: "0b0e6a5c-1111-4222-8333-444455556666",
      source: "android",
    },
    destination: "https://portal.exemplo.com/api/webhooks/evolution",
    date_time: "2026-11-17T02:13:20.000Z",
    sender: "351900000000@s.whatsapp.net",
    server_url: "https://evolution.exemplo.com",
    // A Evolution envia a chave da instância junto: nunca registrar o payload.
    apikey: "token-da-instancia-nao-deve-vazar",
  };
}
