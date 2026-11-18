import type { UserRole, UserStatus } from "./roles";

export const ROLE_LABELS: Record<UserRole, string> = {
  GESTOR: "Gestor",
  VENDEDOR: "Vendedor",
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  PENDENTE: "Convite pendente",
  ATIVO: "Ativo",
  INATIVO: "Inativo",
};

/** `5511988887777` → `+55 (11) 98888-7777`; `351912345678` → `+351 912 345 678`. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "—";
  const brazilian = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (brazilian) {
    const [, ddd, prefix, suffix] = brazilian;
    return `+55 (${ddd}) ${prefix}-${suffix}`;
  }
  const portuguese = digits.match(/^351(\d{3})(\d{3})(\d{3})$/);
  if (portuguese) return `+351 ${portuguese.slice(1).join(" ")}`;
  return `+${digits}`;
}

/** Como chamar um lead na tela quando o WhatsApp não informa o nome. */
export function leadTitle(lead: { name: string | null; phone: string | null }): string {
  return lead.name || (lead.phone ? formatPhone(lead.phone) : "Contato sem número");
}

export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("pt-BR", { timeZone });
  const time = date.toLocaleTimeString("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} às ${time}`;
}

export type LeadStage = "QUALIFICANDO" | "AGUARDANDO_VENDEDOR" | "DISTRIBUIDO" | "HUMANO";

export const STAGE_LABELS: Record<LeadStage, string> = {
  QUALIFICANDO: "Com a assistente",
  AGUARDANDO_VENDEDOR: "Aguardando vendedor",
  DISTRIBUIDO: "Com vendedor",
  HUMANO: "Com a equipe",
};
