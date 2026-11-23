import { and, asc, eq, sql } from "drizzle-orm";
import { type LeadTask, leadTasks, type NewLeadTask } from "../db/schema";
import type { Database } from "../db/types";

export function taskModel(db: Database) {
  const ofLead = (leadId: string, taskId: string) =>
    and(eq(leadTasks.id, taskId), eq(leadTasks.leadId, leadId));

  return {
    /** Abertas primeiro, por vencimento; concluídas no fim. */
    async listByLead(leadId: string): Promise<LeadTask[]> {
      return db
        .select()
        .from(leadTasks)
        .where(eq(leadTasks.leadId, leadId))
        .orderBy(
          sql`${leadTasks.doneAt} IS NOT NULL`,
          asc(leadTasks.dueDate),
          asc(leadTasks.createdAt),
        );
    },

    async create(data: NewLeadTask): Promise<LeadTask> {
      const [task] = await db.insert(leadTasks).values(data).returning();
      return task;
    },

    async setDone(
      leadId: string,
      taskId: string,
      doneAt: Date | null,
    ): Promise<LeadTask | null> {
      const [task] = await db
        .update(leadTasks)
        .set({ doneAt })
        .where(ofLead(leadId, taskId))
        .returning();
      return task ?? null;
    },

    async delete(leadId: string, taskId: string): Promise<boolean> {
      const deleted = await db
        .delete(leadTasks)
        .where(ofLead(leadId, taskId))
        .returning({ id: leadTasks.id });
      return deleted.length > 0;
    },
  };
}

export type TaskModel = ReturnType<typeof taskModel>;
