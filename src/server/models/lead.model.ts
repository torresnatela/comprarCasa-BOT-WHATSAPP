import { desc, eq, isNull, min, sql } from "drizzle-orm";
import { type Lead, leads, leadTasks, type NewLead } from "../db/schema";
import type { Database } from "../db/types";

/** Lead com o vencimento da próxima tarefa aberta (AAAA-MM-DD ou nulo). */
export type LeadWithNextTask = Lead & { nextTaskDue: string | null };

/** Campos do funil que mudam juntos ao trocar a etapa ou pausar a IA. */
export type FunnelUpdate = Partial<
  Pick<
    Lead,
    | "stage"
    | "automationPaused"
    | "stageChangedAt"
    | "wonType"
    | "wonValue"
    | "wonConditions"
    | "lostReason"
    | "lostNote"
  >
>;

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

    /** Leads com conversa mais recente primeiro, com a próxima tarefa aberta. */
    async list(): Promise<LeadWithNextTask[]> {
      const nextTasks = db
        .select({ leadId: leadTasks.leadId, due: min(leadTasks.dueDate).as("due") })
        .from(leadTasks)
        .where(isNull(leadTasks.doneAt))
        .groupBy(leadTasks.leadId)
        .as("next_tasks");
      const rows = await db
        .select({ lead: leads, nextTaskDue: nextTasks.due })
        .from(leads)
        .leftJoin(nextTasks, eq(nextTasks.leadId, leads.id))
        .orderBy(desc(leads.lastMessageAt));
      return rows.map(({ lead, nextTaskDue }) => ({ ...lead, nextTaskDue }));
    },

    async updateFunnel(id: string, data: FunnelUpdate): Promise<Lead | null> {
      const [lead] = await db
        .update(leads)
        .set(data)
        .where(eq(leads.id, id))
        .returning();
      return lead ?? null;
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
