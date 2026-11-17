import { and, eq, isNull } from "drizzle-orm";
import { type Invite, invites, type NewInvite } from "../db/schema";
import type { Database } from "../db/types";

export function inviteModel(db: Database) {
  return {
    async create(data: NewInvite): Promise<Invite> {
      const [invite] = await db.insert(invites).values(data).returning();
      return invite;
    },

    async findByTokenHash(tokenHash: string): Promise<Invite | null> {
      const [invite] = await db
        .select()
        .from(invites)
        .where(eq(invites.tokenHash, tokenHash));
      return invite ?? null;
    },

    /** Devolve `false` se o convite já tinha sido usado (protege contra uso duplo). */
    async markUsed(id: string, usedAt: Date): Promise<boolean> {
      const updated = await db
        .update(invites)
        .set({ usedAt })
        .where(and(eq(invites.id, id), isNull(invites.usedAt)))
        .returning({ id: invites.id });
      return updated.length > 0;
    },

    async deleteUnusedByUserId(userId: string): Promise<void> {
      await db
        .delete(invites)
        .where(and(eq(invites.userId, userId), isNull(invites.usedAt)));
    },
  };
}

export type InviteModel = ReturnType<typeof inviteModel>;
