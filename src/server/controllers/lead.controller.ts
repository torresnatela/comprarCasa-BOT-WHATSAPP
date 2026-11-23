import { NotFoundError } from "../http/errors";
import type { Guard } from "../http/guard";
import { handle, json, parseBody } from "../http/respond";
import type { ConversationService } from "../services/conversation.service";
import type { FunnelService } from "../services/funnel.service";
import {
  automationSchema,
  changeStageSchema,
  createTaskSchema,
  idSchema,
  replySchema,
  updateTaskSchema,
} from "../validation/schemas";
import { toPublicLead, toPublicMessage, toPublicTask } from "./presenters";

type Deps = {
  guard: Guard;
  conversations: ConversationService;
  funnel: FunnelService;
};
type IdContext = { params: Promise<{ id: string }> };
type TaskContext = { params: Promise<{ id: string; tarefaId: string }> };

async function readId({ params }: IdContext): Promise<string> {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) {
    throw new NotFoundError("LEAD_NOT_FOUND", "Lead não encontrado.");
  }
  return parsed.data;
}

async function readTaskIds({ params }: TaskContext) {
  const { id, tarefaId } = await params;
  const lead = idSchema.safeParse(id);
  if (!lead.success) throw new NotFoundError("LEAD_NOT_FOUND", "Lead não encontrado.");
  const task = idSchema.safeParse(tarefaId);
  if (!task.success) throw new NotFoundError("TASK_NOT_FOUND", "Tarefa não encontrada.");
  return { leadId: lead.data, taskId: task.data };
}

/** Nesta fase só o gestor vê os leads; o vendedor entra com o rodízio. */
export function createLeadController({ guard, conversations, funnel }: Deps) {
  return {
    list: handle(async (request) => {
      await guard.requireRole(request, "GESTOR");
      const leads = await conversations.listLeads();
      return json({ leads: leads.map(toPublicLead) });
    }),

    show: handle(async (request, context: IdContext) => {
      await guard.requireRole(request, "GESTOR");
      const { lead, messages, tasks } = await conversations.getConversation(
        await readId(context),
      );
      return json({
        lead: toPublicLead(lead),
        messages: messages.map(toPublicMessage),
        tasks: tasks.map(toPublicTask),
      });
    }),

    reply: handle(async (request, context: IdContext) => {
      const actor = await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const { text } = await parseBody(request, replySchema);
      const message = await conversations.reply(id, text, actor);
      return json({ message: toPublicMessage(message) }, { status: 201 });
    }),

    changeStage: handle(async (request, context: IdContext) => {
      await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const input = await parseBody(request, changeStageSchema);
      return json({ lead: toPublicLead(await funnel.changeStage(id, input)) });
    }),

    setAutomation: handle(async (request, context: IdContext) => {
      await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const { paused } = await parseBody(request, automationSchema);
      return json({ lead: toPublicLead(await funnel.setAutomation(id, paused)) });
    }),

    createTask: handle(async (request, context: IdContext) => {
      const actor = await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const input = await parseBody(request, createTaskSchema);
      const task = await funnel.createTask(id, input, actor);
      return json({ task: toPublicTask(task) }, { status: 201 });
    }),

    updateTask: handle(async (request, context: TaskContext) => {
      await guard.requireRole(request, "GESTOR");
      const { leadId, taskId } = await readTaskIds(context);
      const { done } = await parseBody(request, updateTaskSchema);
      return json({ task: toPublicTask(await funnel.setTaskDone(leadId, taskId, done)) });
    }),

    deleteTask: handle(async (request, context: TaskContext) => {
      await guard.requireRole(request, "GESTOR");
      const { leadId, taskId } = await readTaskIds(context);
      await funnel.deleteTask(leadId, taskId);
      return new Response(null, { status: 204 });
    }),
  };
}

export type LeadController = ReturnType<typeof createLeadController>;
