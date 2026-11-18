import { describe, expect, it } from "vitest";
import { INSTANCE, upsertPayload } from "../../../../tests/evolution-fixtures";
import { parseEvolutionEvent } from "./webhook-payload";

const message = (overrides: Parameters<typeof upsertPayload>[0] = {}) => {
  const parsed = parseEvolutionEvent(upsertPayload(overrides));
  if (parsed.kind !== "message") throw new Error(`ignorado: ${parsed.reason}`);
  return parsed;
};

const ignored = (payload: unknown) => {
  const parsed = parseEvolutionEvent(payload);
  if (parsed.kind !== "ignored") throw new Error("deveria ter sido ignorado");
  return parsed.reason;
};

describe("parseEvolutionEvent — mensagens de texto", () => {
  it("traduz uma mensagem de texto recebida", () => {
    expect(message()).toEqual({
      kind: "message",
      instance: INSTANCE,
      message: {
        externalId: "3EB0A1B2C3D4E5F6",
        jid: "351912345678@s.whatsapp.net",
        phone: "351912345678",
        pushName: "Maria Silva",
        fromMe: false,
        type: "TEXTO",
        text: "Olá, vi o anúncio do T2 em Caldas",
        sentAt: new Date(1794880000 * 1000),
      },
    });
  });

  it("marca como enviada a mensagem digitada no celular da imobiliária e descarta o pushName", () => {
    const { message: parsed } = message({ fromMe: true, pushName: "Você" });

    expect(parsed.fromMe).toBe(true);
    expect(parsed.pushName).toBeNull();
  });

  it("aceita também o evento send.message (envio feito pela API)", () => {
    const parsed = message({ event: "send.message", fromMe: true });

    expect(parsed.message.text).toBe("Olá, vi o anúncio do T2 em Caldas");
  });

  it("usa o número real quando o WhatsApp manda um identificador @lid com alternativa", () => {
    const { message: parsed } = message({
      remoteJid: "99887766554433@lid",
      remoteJidAlt: "351912345678@s.whatsapp.net",
    });

    expect(parsed.jid).toBe("351912345678@s.whatsapp.net");
    expect(parsed.phone).toBe("351912345678");
  });

  it("guarda o @lid sem telefone quando não há número disponível", () => {
    const { message: parsed } = message({ remoteJid: "99887766554433@lid" });

    expect(parsed.jid).toBe("99887766554433@lid");
    expect(parsed.phone).toBeNull();
  });

  it("remove o sufixo de dispositivo do identificador", () => {
    const { message: parsed } = message({
      remoteJid: "351912345678:12@s.whatsapp.net",
    });

    expect(parsed.jid).toBe("351912345678@s.whatsapp.net");
  });

  it("trata pushName vazio como ausente", () => {
    expect(message({ pushName: "  " }).message.pushName).toBeNull();
    expect(message({ pushName: null }).message.pushName).toBeNull();
  });
});

describe("parseEvolutionEvent — outros tipos de conteúdo", () => {
  it.each([
    ["imageMessage", { imageMessage: { mimetype: "image/jpeg" } }, "[imagem]"],
    ["audioMessage", { audioMessage: { seconds: 12 } }, "[áudio]"],
    ["videoMessage", { videoMessage: {} }, "[vídeo]"],
    ["documentMessage", { documentMessage: { fileName: "planta.pdf" } }, "[documento]"],
    ["stickerMessage", { stickerMessage: {} }, "[figurinha]"],
    ["locationMessage", { locationMessage: {} }, "[localização]"],
    ["contactMessage", { contactMessage: {} }, "[contato]"],
    ["pollCreationMessageV3", { pollCreationMessageV3: {} }, "[mensagem não suportada]"],
  ])("registra %s como marcador, sem baixar o arquivo", (messageType, content, text) => {
    const { message: parsed } = message({ messageType, message: content });

    expect(parsed.type).toBe("OUTRO");
    expect(parsed.text).toBe(text);
  });

  it("inclui a legenda de imagem, vídeo e documento", () => {
    const { message: parsed } = message({
      messageType: "imageMessage",
      message: { imageMessage: { caption: "É este o apartamento?" } },
    });

    expect(parsed.text).toBe("[imagem] É este o apartamento?");
  });
});

describe("parseEvolutionEvent — o que é ignorado", () => {
  it.each([
    ["grupo", { remoteJid: "120363025246125486@g.us" }, "grupo"],
    ["status", { remoteJid: "status@broadcast" }, "transmissão"],
    ["canal", { remoteJid: "120363111111111111@newsletter" }, "transmissão"],
    ["reação", { messageType: "reactionMessage", message: { reactionMessage: {} } }, "mensagem de sistema"],
    ["protocolo", { messageType: "protocolMessage", message: { protocolMessage: {} } }, "mensagem de sistema"],
    ["texto vazio", { message: { conversation: "   " } }, "mensagem vazia"],
  ])("ignora %s", (_caso, overrides, reason) => {
    expect(ignored(upsertPayload(overrides))).toBe(reason);
  });

  it("ignora eventos que não são de mensagem", () => {
    expect(
      ignored({ event: "connection.update", instance: INSTANCE, data: { state: "open" } }),
    ).toBe("evento connection.update");
  });

  it.each([
    ["null", null],
    ["texto", "oi"],
    ["objeto vazio", {}],
    ["sem data", { event: "messages.upsert", instance: INSTANCE }],
    ["sem id", { event: "messages.upsert", instance: INSTANCE, data: { key: { remoteJid: "351912345678@s.whatsapp.net", fromMe: false }, message: { conversation: "oi" }, messageType: "conversation", messageTimestamp: 1 } }],
  ])("ignora payload malformado: %s", (_caso, payload) => {
    expect(ignored(payload)).toBe("payload inválido");
  });
});
