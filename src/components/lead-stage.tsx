import { type LeadStage, STAGE_LABELS } from "@/lib/funnel";
import { dueStatus } from "@/lib/format";

const STAGE_STYLES: Record<LeadStage, string> = {
  QUALIFICANDO: "bg-violet-50 text-violet-700 ring-violet-200",
  AGUARDANDO_VENDEDOR: "bg-amber-50 text-amber-800 ring-amber-200",
  DISTRIBUIDO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  HUMANO: "bg-sky-50 text-sky-800 ring-sky-200",
  PARADO: "bg-gray-100 text-gray-700 ring-gray-200",
  GANHO: "bg-brand-50 text-brand-700 ring-brand-100",
  PERDIDO: "bg-red-50 text-red-700 ring-red-200",
};

const pill =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

/** Etapa do lead; quando já foi distribuído, mostra o nome do vendedor. */
export function StageBadge({
  stage,
  seller,
}: {
  stage: LeadStage;
  seller?: { name: string } | null;
}) {
  const label = stage === "DISTRIBUIDO" && seller ? seller.name : STAGE_LABELS[stage];
  return <span className={`${pill} ${STAGE_STYLES[stage]}`}>{label}</span>;
}

export function PausedBadge() {
  return <span className={`${pill} bg-white text-gray-600 ring-gray-300`}>IA pausada</span>;
}

/** Aviso de tarefa vencida ou para hoje; nada para datas futuras. */
export function TaskDueBadge({ due }: { due: string | null }) {
  if (!due) return null;
  const status = dueStatus(due);
  if (status === "futura") return null;
  return status === "vencida" ? (
    <span className={`${pill} bg-red-50 text-red-700 ring-red-200`}>Tarefa vencida</span>
  ) : (
    <span className={`${pill} bg-amber-50 text-amber-800 ring-amber-200`}>Tarefa hoje</span>
  );
}
