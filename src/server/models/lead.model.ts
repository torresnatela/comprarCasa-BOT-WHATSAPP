import { and, desc, eq, sql } from "drizzle-orm";
import {
  type Lead,
  type LeadStage,
  leads,
  type NewLead,
  type Qualification,
} from "../db/schema";
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

    /** Lê o lead travando a linha até o fim da transação. */
    async lockById(id: string): Promise<Lead | null> {
      const [lead] = await db.select().from(leads).where(eq(leads.id, id)).for("update");
      return lead ?? null;
    },

    /** Troca a etapa só se o lead ainda estiver em `from`. Devolve `null` se não trocou. */
    async moveStage(id: string, from: LeadStage, to: LeadStage): Promise<Lead | null> {
      const [lead] = await db
        .update(leads)
        .set({ stage: to })
        .where(and(eq(leads.id, id), eq(leads.stage, from)))
        .returning();
      return lead ?? null;
    },

    async saveQualification(id: string, qualification: Qualification): Promise<void> {
      await db.update(leads).set({ qualification }).where(eq(leads.id, id));
    },

    /** Encerra a qualificação: entrega ao vendedor ou deixa aguardando um. */
    async finishQualification(
      id: string,
      data: {
        qualification: Qualification;
        summary: string;
        assignedTo: string | null;
        at: Date;
      },
    ): Promise<Lead> {
      const [lead] = await db
        .update(leads)
        .set({
          qualification: data.qualification,
          qualificationSummary: data.summary,
          stage: data.assignedTo ? "DISTRIBUIDO" : "AGUARDANDO_VENDEDOR",
          assignedTo: data.assignedTo,
          assignedAt: data.assignedTo ? data.at : null,
        })
        .where(eq(leads.id, id))
        .returning();
      return lead;
    },
  };
}

export type LeadModel = ReturnType<typeof leadModel>;
