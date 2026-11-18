import type { Lead, Message, User } from "../db/schema";

/** Formato de usuário que pode sair do servidor (nunca inclui o hash da senha). */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;

export function toPublicLead(lead: Lead) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    lastMessageAt: lead.lastMessageAt.toISOString(),
    lastMessageText: lead.lastMessageText,
  };
}

export function toPublicMessage(message: Message) {
  return {
    id: message.id,
    direction: message.direction,
    type: message.type,
    text: message.text,
    sentAt: message.sentAt.toISOString(),
  };
}

export type PublicLead = ReturnType<typeof toPublicLead>;
export type PublicMessage = ReturnType<typeof toPublicMessage>;
