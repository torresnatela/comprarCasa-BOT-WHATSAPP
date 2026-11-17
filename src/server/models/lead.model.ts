import { desc, eq, sql } from "drizzle-orm";
import { type Lead, leads, type NewLead } from "../db/schema";
import type { Database } from "../db/types";

type Activity = {
  at: Date;
  text: string;
  name?: string | null;
  phone?: string | null;
};

export function leadModel(db: Database) {
  async function findByJid(whatsappJid: string): Promise<Lead | null> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.whatsappJid, whatsappJid));
    return lead ?? null;
  }

  return {
    findByJid,

    async findById(id: string): Promise<Lead | null> {
      const [lead] = await db.select().from(leads).where(eq(leads.id, id));
      return lead ?? null;
    },

    /** Leads com conversa mais recente primeiro. */
    async list(): Promise<Lead[]> {
      return db.select().from(leads).orderBy(desc(leads.lastMessageAt));
    },

    /** Seguro contra duas mensagens do mesmo contato chegando ao mesmo tempo. */
    async findOrCreate(data: NewLead): Promise<{ lead: Lead; created: boolean }> {
      const [created] = await db
        .insert(leads)
        .values(data)
        .onConflictDoNothing({ target: leads.whatsappJid })
        .returning();
      if (created) return { lead: created, created: true };

      const existing = await findByJid(data.whatsappJid);
      if (!existing) throw new Error("Lead não encontrado após conflito.");
      return { lead: existing, created: false };
    },

    /**
     * Registra uma mensagem na conversa: avança a "última mensagem" só se ela
     * for mais nova, e completa nome/telefone que ainda não eram conhecidos.
     */
    async recordActivity(id: string, activity: Activity): Promise<Lead | null> {
      const isNewer = sql`${activity.at.toISOString()}::timestamptz >= ${leads.lastMessageAt}`;
      const [lead] = await db
        .update(leads)
        .set({
          lastMessageText: sql`CASE WHEN ${isNewer} THEN ${activity.text} ELSE ${leads.lastMessageText} END`,
          lastMessageAt: sql`GREATEST(${leads.lastMessageAt}, ${activity.at.toISOString()}::timestamptz)`,
          name: sql`COALESCE(${leads.name}, ${activity.name ?? null})`,
          phone: sql`COALESCE(${leads.phone}, ${activity.phone ?? null})`,
        })
        .where(eq(leads.id, id))
        .returning();
      return lead ?? null;
    },
  };
}

export type LeadModel = ReturnType<typeof leadModel>;
