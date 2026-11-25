/*
 * Acesso dos colaboradores às conversas (leads). Fica fora de `server/`
 * porque as telas também usam; o schema do banco importa daqui.
 */
import type { UserRole } from "./roles";

/**
 * Nível de acesso do vendedor às mensagens:
 * - TODAS: vê e responde todos os leads, inclusive os ainda sem vendedor;
 * - PROPRIAS: vê e responde só os leads que o rodízio entregou a ele;
 * - NENHUMA: não vê nem responde nada.
 * O gestor sempre tem acesso a tudo, seja qual for o valor gravado.
 */
export const MESSAGE_ACCESS_LEVELS = ["TODAS", "PROPRIAS", "NENHUMA"] as const;

export type MessageAccess = (typeof MESSAGE_ACCESS_LEVELS)[number];

export const DEFAULT_MESSAGE_ACCESS: MessageAccess = "PROPRIAS";

export const MESSAGE_ACCESS_LABELS: Record<MessageAccess, string> = {
  TODAS: "Todas as conversas",
  PROPRIAS: "Só os leads dele",
  NENHUMA: "Sem acesso",
};

/** Quais leads a pessoa alcança: todos, só os entregues a ela, ou nenhum. */
export type LeadScope = "ALL" | "OWN" | "NONE";

type Actor = { id: string; role: UserRole; messageAccess: MessageAccess };

export function leadScope(user: Pick<Actor, "role" | "messageAccess">): LeadScope {
  if (user.role === "GESTOR") return "ALL";
  switch (user.messageAccess) {
    case "TODAS":
      return "ALL";
    case "PROPRIAS":
      return "OWN";
    default:
      return "NONE";
  }
}

/** Se a pessoa pode ver e agir sobre este lead (conversa, funil e tarefas). */
export function canAccessLead(
  user: Actor,
  lead: { assignedTo: string | null },
): boolean {
  const scope = leadScope(user);
  if (scope === "ALL") return true;
  return scope === "OWN" && lead.assignedTo === user.id;
}
