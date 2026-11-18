import type { Lead, Message, User } from "../db/schema";
import type { LeadWithSeller } from "../models/lead.model";
import type { RotationEntry } from "../models/user.model";

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

export function toPublicLead(lead: Lead | LeadWithSeller) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    lastMessageAt: lead.lastMessageAt.toISOString(),
    lastMessageText: lead.lastMessageText,
    stage: lead.stage,
    seller:
      lead.assignedTo && "sellerName" in lead && lead.sellerName
        ? { id: lead.assignedTo, name: lead.sellerName }
        : null,
    assignedAt: lead.assignedAt?.toISOString() ?? null,
    qualification: lead.qualification ?? null,
    qualificationSummary: lead.qualificationSummary,
  };
}

export function toPublicMessage(message: Message) {
  return {
    id: message.id,
    direction: message.direction,
    type: message.type,
    text: message.text,
    sentByBot: message.sentByBot,
    sentAt: message.sentAt.toISOString(),
  };
}

export type PublicLead = ReturnType<typeof toPublicLead>;
export type PublicMessage = ReturnType<typeof toPublicMessage>;

/** Fila do rodízio: `position` é a ordem de quem recebe o próximo lead (nula fora da fila). */
export function toPublicRotation(entries: RotationEntry[]) {
  let position = 0;
  return entries.map(({ user, assignedLeads }) => ({
    id: user.id,
    name: user.name,
    phone: user.phone,
    inRotation: user.inRotation,
    position: user.inRotation ? ++position : null,
    lastAssignedAt: user.lastAssignedAt?.toISOString() ?? null,
    assignedLeads,
  }));
}

export type PublicRotationEntry = ReturnType<typeof toPublicRotation>[number];
