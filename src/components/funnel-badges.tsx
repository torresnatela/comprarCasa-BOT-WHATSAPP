import { type LeadStage, STAGE_LABELS } from "@/lib/funnel";
import { dueStatus } from "@/lib/format";

const stageStyles: Record<LeadStage, string> = {
  QUALIFICACAO: "bg-sky-50 text-sky-800 ring-sky-200",
  EM_ANDAMENTO: "bg-amber-50 text-amber-800 ring-amber-200",
  PARADO: "bg-gray-100 text-gray-700 ring-gray-200",
  GANHO: "bg-brand-50 text-brand-700 ring-brand-100",
  PERDIDO: "bg-red-50 text-red-700 ring-red-200",
};

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StageBadge({ stage }: { stage: LeadStage }) {
  return <span className={`${pill} ${stageStyles[stage]}`}>{STAGE_LABELS[stage]}</span>;
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
