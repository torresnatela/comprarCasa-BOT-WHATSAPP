import { NotFoundError } from "../http/errors";
import type { Guard } from "../http/guard";
import { handle, json, parseBody } from "../http/respond";
import type { ConversationService } from "../services/conversation.service";
import { idSchema, replySchema } from "../validation/schemas";
import { toPublicLead, toPublicMessage } from "./presenters";

type Deps = { guard: Guard; conversations: ConversationService };
type IdContext = { params: Promise<{ id: string }> };

async function readId({ params }: IdContext): Promise<string> {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) {
    throw new NotFoundError("LEAD_NOT_FOUND", "Lead não encontrado.");
  }
  return parsed.data;
}

/** Nesta fase só o gestor vê os leads; o vendedor entra com o rodízio. */
export function createLeadController({ guard, conversations }: Deps) {
  return {
    list: handle(async (request) => {
      await guard.requireRole(request, "GESTOR");
      const leads = await conversations.listLeads();
      return json({ leads: leads.map(toPublicLead) });
    }),

    show: handle(async (request, context: IdContext) => {
      await guard.requireRole(request, "GESTOR");
      const { lead, messages } = await conversations.getConversation(
        await readId(context),
      );
      return json({
        lead: toPublicLead(lead),
        messages: messages.map(toPublicMessage),
      });
    }),

    reply: handle(async (request, context: IdContext) => {
      const actor = await guard.requireRole(request, "GESTOR");
      const id = await readId(context);
      const { text } = await parseBody(request, replySchema);
      const message = await conversations.reply(id, text, actor);
      return json({ message: toPublicMessage(message) }, { status: 201 });
    }),
  };
}

export type LeadController = ReturnType<typeof createLeadController>;
