"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import {
  DEAL_TYPE_LABELS,
  isClosedStage,
  LEAD_STAGES,
  type LeadStage,
  MANUAL_STAGES,
  LOST_REASON_LABELS,
  STAGE_LABELS,
} from "@/lib/funnel";
import { formatMoney } from "@/lib/format";
import type { PublicLead, PublicTask } from "@/server/controllers/presenters";
import { CloseLeadDialog } from "./close-lead-dialog";
import { LeadTasks } from "./lead-tasks";
import { Alert, Button, SelectField } from "./ui";

type Props = {
  lead: PublicLead;
  tasks: PublicTask[];
  onLeadChange: (lead: PublicLead) => void;
  onTasksChange: (tasks: PublicTask[]) => void;
};

/** Etapa do funil, pausa da IA, desfecho e tarefas de um contato. */
export function LeadFunnelPanel({ lead, tasks, onLeadChange, onTasksChange }: Props) {
  const path = `/api/leads/${encodeURIComponent(lead.id)}`;
  const [closing, setClosing] = useState<"GANHO" | "PERDIDO" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(suffix: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ lead: PublicLead }>(`${path}/${suffix}`, {
        method: "PATCH",
        body,
      });
      onLeadChange(result.lead);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function onStageChange(stage: LeadStage) {
    if (stage === lead.stage) return;
    if (stage === "GANHO" || stage === "PERDIDO") setClosing(stage);
    else void patch("etapa", { stage });
  }

  const inQualification = lead.stage === "QUALIFICANDO";
  // Etapas do rodízio só aparecem quando já são a atual.
  const options = LEAD_STAGES.filter(
    (stage) => MANUAL_STAGES.includes(stage) || stage === lead.stage,
  );

  return (
    <aside
      aria-label="Funil"
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-4"
    >
      {error && <Alert>{error}</Alert>}

      <SelectField
        label="Etapa"
        value={lead.stage}
        disabled={busy}
        onChange={(event) => onStageChange(event.target.value as LeadStage)}
      >
        {options.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </option>
        ))}
      </SelectField>

      {lead.won && (
        <dl className="space-y-1 rounded-lg bg-brand-50 p-3 text-sm text-gray-800">
          <dt className="font-medium text-brand-700">
            {DEAL_TYPE_LABELS[lead.won.type]} · {formatMoney(lead.won.value)}
          </dt>
          {lead.won.conditions && (
            <dd className="whitespace-pre-wrap">{lead.won.conditions}</dd>
          )}
        </dl>
      )}
      {lead.lost && (
        <dl className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-gray-800">
          <dt className="font-medium text-red-700">
            Motivo: {LOST_REASON_LABELS[lead.lost.reason]}
          </dt>
          {lead.lost.note && <dd className="whitespace-pre-wrap">{lead.lost.note}</dd>}
        </dl>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Atendimento por IA</h3>
        {inQualification ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {lead.automationPaused ? "Pausada" : "Ativa"}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void patch("automacao", { paused: !lead.automationPaused })}
            >
              {lead.automationPaused ? "Retomar IA" : "Pausar IA"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {isClosedStage(lead.stage)
              ? "Desligada: contato fechado."
              : "Desligada: o contato não está com a assistente."}
          </p>
        )}
      </div>

      <LeadTasks leadId={lead.id} tasks={tasks} onChange={onTasksChange} />

      {closing && (
        <CloseLeadDialog
          leadId={lead.id}
          outcome={closing}
          onClose={() => setClosing(null)}
          onSaved={(updated) => {
            setClosing(null);
            onLeadChange(updated);
          }}
        />
      )}
    </aside>
  );
}
