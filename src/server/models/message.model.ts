import { asc, eq } from "drizzle-orm";
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
  };
}

export type MessageModel = ReturnType<typeof messageModel>;
