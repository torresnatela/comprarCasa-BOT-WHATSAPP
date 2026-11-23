import { and, asc, count, desc, eq } from "drizzle-orm";
import { type Message, messages, type NewMessage } from "../db/schema";
import type { Database } from "../db/types";

export function messageModel(db: Database) {
  return {
    /** Devolve `null` quando a mensagem (mesmo id externo) já estava gravada. */
    async insertIfNew(data: NewMessage): Promise<Message | null> {
      const [message] = await db
        .insert(messages)
        .values(data)
        .onConflictDoNothing({ target: messages.externalId })
        .returning();
      return message ?? null;
    },

    async findByExternalId(externalId: string): Promise<Message | null> {
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.externalId, externalId));
      return message ?? null;
    },

    async listByLead(leadId: string): Promise<Message[]> {
      return db
        .select()
        .from(messages)
        .where(eq(messages.leadId, leadId))
        .orderBy(asc(messages.sentAt), asc(messages.createdAt));
    },

    /** Última mensagem recebida do lead (a mais recente pelo horário do WhatsApp). */
    async latestInbound(leadId: string): Promise<Message | null> {
      const [message] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.leadId, leadId), eq(messages.direction, "RECEBIDA")))
        .orderBy(desc(messages.sentAt), desc(messages.createdAt))
        .limit(1);
      return message ?? null;
    },

    async countByBot(leadId: string): Promise<number> {
      const [row] = await db
        .select({ total: count() })
        .from(messages)
        .where(and(eq(messages.leadId, leadId), eq(messages.sentByBot, true)));
      return row.total;
    },
  };
}

export type MessageModel = ReturnType<typeof messageModel>;
