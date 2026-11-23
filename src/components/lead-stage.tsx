import { type LeadStage, STAGE_LABELS } from "@/lib/format";

const STAGE_STYLES: Record<LeadStage, string> = {
  QUALIFICANDO: "bg-violet-50 text-violet-700 ring-violet-200",
  AGUARDANDO_VENDEDOR: "bg-amber-50 text-amber-800 ring-amber-200",
  DISTRIBUIDO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  HUMANO: "bg-gray-50 text-gray-700 ring-gray-200",
};

/** Etapa do lead; quando já foi distribuído, mostra o nome do vendedor. */
export function StageBadge({
  stage,
  seller,
}: {
  stage: LeadStage;
  seller?: { name: string } | null;
}) {
  const label = stage === "DISTRIBUIDO" && seller ? seller.name : STAGE_LABELS[stage];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_STYLES[stage]}`}
    >
      {label}
    </span>
  );
}
