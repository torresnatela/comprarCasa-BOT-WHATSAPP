import { z } from "zod";

/** Mensagem do WhatsApp já no formato interno do sistema. */
export type IncomingMessage = {
  /** Id da mensagem no WhatsApp; usado para não gravar a mesma duas vezes. */
  externalId: string;
  /** Identificador da conversa no WhatsApp (ex.: `351912345678@s.whatsapp.net`). */
  jid: string;
  /** Só dígitos, com DDI. Nulo quando o WhatsApp não revela o número (@lid). */
  phone: string | null;
  pushName: string | null;
  /** `true` quando quem enviou foi o número da imobiliária. */
  fromMe: boolean;
  type: "TEXTO" | "OUTRO";
  text: string;
  sentAt: Date;
};

export type ParsedEvent =
  | { kind: "message"; instance: string; message: IncomingMessage }
  | { kind: "ignored"; reason: string };

const MESSAGE_EVENTS = new Set(["messages.upsert", "send.message"]);

/** Tipos que não são conversa: reações, recibos, chaves de criptografia etc. */
const SYSTEM_TYPES = new Set([
  "protocolMessage",
  "reactionMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "pollUpdateMessage",
  "keepInChatMessage",
  "encReactionMessage",
]);

const MEDIA_LABELS: Record<string, string> = {
  imageMessage: "[imagem]",
  audioMessage: "[áudio]",
  videoMessage: "[vídeo]",
  ptvMessage: "[vídeo]",
  documentMessage: "[documento]",
  stickerMessage: "[figurinha]",
  locationMessage: "[localização]",
  liveLocationMessage: "[localização]",
  contactMessage: "[contato]",
  contactsArrayMessage: "[contato]",
};

const envelopeSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.unknown().optional(),
});

const messageSchema = z.object({
  key: z.object({
    id: z.string().min(1),
    remoteJid: z.string().min(1),
    remoteJidAlt: z.string().nullish(),
    fromMe: z.boolean(),
  }),
  pushName: z.string().nullish(),
  message: z.record(z.string(), z.unknown()),
  messageType: z.string(),
  messageTimestamp: z.coerce.number().positive(),
});

const ignored = (reason: string): ParsedEvent => ({ kind: "ignored", reason });

/** `351912345678:12@s.whatsapp.net` → `351912345678@s.whatsapp.net` */
function normalizeJid(jid: string): string {
  const [user, server] = jid.split("@");
  return `${user.split(":")[0]}@${server}`;
}

function contentOf(
  messageType: string,
  message: Record<string, unknown>,
): Pick<IncomingMessage, "type" | "text"> {
  if (messageType === "conversation") {
    const text = typeof message.conversation === "string" ? message.conversation : "";
    return { type: "TEXTO", text: text.trim() };
  }
  const label = MEDIA_LABELS[messageType] ?? "[mensagem não suportada]";
  const caption = (message[messageType] as { caption?: unknown } | undefined)?.caption;
  const text =
    typeof caption === "string" && caption.trim()
      ? `${label} ${caption.trim()}`
      : label;
  return { type: "OUTRO", text };
}

/**
 * Traduz o corpo que a Evolution API envia ao webhook.
 * Nunca lança: o que não é uma mensagem de conversa vira `ignored`.
 */
export function parseEvolutionEvent(payload: unknown): ParsedEvent {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) return ignored("payload inválido");
  const { event, instance } = envelope.data;
  if (!MESSAGE_EVENTS.has(event)) return ignored(`evento ${event}`);

  const parsed = messageSchema.safeParse(envelope.data.data);
  if (!parsed.success) return ignored("payload inválido");
  const { key, pushName, message, messageType, messageTimestamp } = parsed.data;

  // Com endereçamento @lid, o número real (quando existe) vem em remoteJidAlt.
  const rawJid =
    key.remoteJid.endsWith("@lid") && key.remoteJidAlt
      ? key.remoteJidAlt
      : key.remoteJid;
  if (rawJid.endsWith("@g.us")) return ignored("grupo");
  if (rawJid.endsWith("@broadcast") || rawJid.endsWith("@newsletter")) {
    return ignored("transmissão");
  }
  if (!rawJid.endsWith("@s.whatsapp.net") && !rawJid.endsWith("@lid")) {
    return ignored("payload inválido");
  }
  if (SYSTEM_TYPES.has(messageType)) return ignored("mensagem de sistema");

  const content = contentOf(messageType, message);
  if (!content.text) return ignored("mensagem vazia");

  const jid = normalizeJid(rawJid);
  const name = pushName?.trim();

  return {
    kind: "message",
    instance,
    message: {
      externalId: key.id,
      jid,
      phone: jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0] : null,
      // Em mensagens próprias a Evolution preenche pushName com "Você".
      pushName: key.fromMe || !name ? null : name,
      fromMe: key.fromMe,
      ...content,
      sentAt: new Date(messageTimestamp * 1000),
    },
  };
}
