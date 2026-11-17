import { eq } from "drizzle-orm";
import { type NewSession, type Session, sessions } from "../db/schema";
import type { Database } from "../db/types";

export function sessionModel(db: Database) {
  return {
    async create(data: NewSession): Promise<Session> {
      const [session] = await db.insert(sessions).values(data).returning();
      return session;
    },

    async findByTokenHash(tokenHash: string): Promise<Session | null> {
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash));
      return session ?? null;
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    async deleteByUserId(userId: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.userId, userId));
    },
  };
}

export type SessionModel = ReturnType<typeof sessionModel>;
