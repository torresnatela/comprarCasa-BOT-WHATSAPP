import { isClosedStage } from "../../lib/funnel";
import type { Lead, LeadTask, User } from "../db/schema";
import type { Database } from "../db/types";
import { AppError, NotFoundError } from "../http/errors";
import { type FunnelUpdate, leadModel } from "../models/lead.model";
import { taskModel } from "../models/task.model";
import type { ChangeStageInput, CreateTaskInput } from "../validation/schemas";

type Deps = { db: Database; now?: () => Date };

const leadNotFound = () => new NotFoundError("LEAD_NOT_FOUND", "Lead não encontrado.");
const taskNotFound = () => new NotFoundError("TASK_NOT_FOUND", "Tarefa não encontrada.");

const NO_OUTCOME = {
  wonType: null,
  wonValue: null,
  wonConditions: null,
  lostReason: null,
  lostNote: null,
} satisfies FunnelUpdate;

/** Funil do contato: etapa, pausa da IA e tarefas. */
export function createFunnelService({ db, now = () => new Date() }: Deps) {
  async function update(leadId: string, data: FunnelUpdate): Promise<Lead> {
    const lead = await leadModel(db).updateFunnel(leadId, data);
    if (!lead) throw leadNotFound();
    return lead;
  }

  async function requireLead(leadId: string): Promise<Lead> {
    const lead = await leadModel(db).findById(leadId);
    if (!lead) throw leadNotFound();
    return lead;
  }

  return {
    /**
     * Fora da qualificação a IA para; voltar para ela não religa sozinho.
     * Os dados de Ganho/Perdido só existem enquanto o contato está fechado.
     */
    changeStage(leadId: string, input: ChangeStageInput): Promise<Lead> {
      const outcome: FunnelUpdate =
        input.stage === "GANHO"
          ? {
              ...NO_OUTCOME,
              wonType: input.wonType,
              wonValue: input.wonValue.toFixed(2),
              wonConditions: input.wonConditions,
            }
          : input.stage === "PERDIDO"
            ? { ...NO_OUTCOME, lostReason: input.lostReason, lostNote: input.lostNote }
            : NO_OUTCOME;

      return update(leadId, {
        ...outcome,
        stage: input.stage,
        stageChangedAt: now(),
        ...(input.stage !== "QUALIFICACAO" && { automationPaused: true }),
      });
    },

    async setAutomation(leadId: string, paused: boolean): Promise<Lead> {
      if (!paused) {
        const lead = await requireLead(leadId);
        if (lead.stage !== "QUALIFICACAO") {
          throw new AppError(
            409,
            "AUTOMATION_OUTSIDE_QUALIFICATION",
            isClosedStage(lead.stage)
              ? "Contato fechado. Reabra e volte para Qualificação para religar a IA."
              : "Volte o contato para Qualificação para religar a IA.",
          );
        }
      }
      return update(leadId, { automationPaused: paused });
    },

    listTasks(leadId: string): Promise<LeadTask[]> {
      return taskModel(db).listByLead(leadId);
    },

    async createTask(
      leadId: string,
      input: CreateTaskInput,
      actor: User,
    ): Promise<LeadTask> {
      await requireLead(leadId);
      return taskModel(db).create({
        leadId,
        title: input.title,
        dueDate: input.dueDate,
        createdBy: actor.id,
      });
    },

    async setTaskDone(leadId: string, taskId: string, done: boolean): Promise<LeadTask> {
      const task = await taskModel(db).setDone(leadId, taskId, done ? now() : null);
      if (!task) throw taskNotFound();
      return task;
    },

    async deleteTask(leadId: string, taskId: string): Promise<void> {
      if (!(await taskModel(db).delete(leadId, taskId))) throw taskNotFound();
    },
  };
}

export type FunnelService = ReturnType<typeof createFunnelService>;
