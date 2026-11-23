import { and, desc, eq, isNull, min, sql } from "drizzle-orm";
import {
  type Lead,
  type LeadStage,
  leads,
  leadTasks,
  type NewLead,
  type Qualification,
  users,
} from "../db/schema";
import type { Database } from "../db/types";

/**
 * Lead com o nome do vendedor que o recebeu (nulo se ninguém recebeu) e o
 * vencimento da próxima tarefa aberta (AAAA-MM-DD ou nulo).
 */
export type LeadWithSeller = Lead & { sellerName: string | null };
export type LeadListItem = LeadWithSeller & { nextTaskDue: string | null };

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

    /** Leads com conversa mais recente primeiro, com vendedor e próxima tarefa. */
    async list(): Promise<LeadListItem[]> {
      const nextTasks = db
        .select({ leadId: leadTasks.leadId, due: min(leadTasks.dueDate).as("due") })
        .from(leadTasks)
        .where(isNull(leadTasks.doneAt))
        .groupBy(leadTasks.leadId)
        .as("next_tasks");
      const rows = await db
        .select({ lead: leads, sellerName: users.name, nextTaskDue: nextTasks.due })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.assignedTo))
        .leftJoin(nextTasks, eq(nextTasks.leadId, leads.id))
        .orderBy(desc(leads.lastMessageAt));
      return rows.map(({ lead, sellerName, nextTaskDue }) => ({
        ...lead,
        sellerName,
        nextTaskDue,
      }));
    },

    async findWithSeller(id: string): Promise<LeadWithSeller | null> {
      const [row] = await db
        .select({ lead: leads, sellerName: users.name })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.assignedTo))
        .where(eq(leads.id, id));
      return row ? { ...row.lead, sellerName: row.sellerName } : null;
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

    /** Lê o lead travando a linha até o fim da transação. */
    async lockById(id: string): Promise<Lead | null> {
      const [lead] = await db.select().from(leads).where(eq(leads.id, id)).for("update");
      return lead ?? null;
    },

    /** Troca a etapa só se o lead ainda estiver em `from`. Devolve `null` se não trocou. */
    async moveStage(id: string, from: LeadStage, to: LeadStage): Promise<Lead | null> {
      const [lead] = await db
        .update(leads)
        .set({ stage: to, stageChangedAt: new Date() })
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
          stageChangedAt: data.at,
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
