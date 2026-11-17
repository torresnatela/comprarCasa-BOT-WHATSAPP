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

/** `5511988887777` → `+55 (11) 98888-7777`. */
export function formatPhone(digits: string): string {
  if (!digits) return "—";
  const brazilian = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!brazilian) return `+${digits}`;
  const [, ddd, prefix, suffix] = brazilian;
  return `+55 (${ddd}) ${prefix}-${suffix}`;
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
