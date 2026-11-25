"use client";

import { type FormEvent, useId, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import {
  DEAL_TYPE_LABELS,
  DEAL_TYPES,
  type DealType,
  LOST_REASON_LABELS,
  LOST_REASONS,
  type LostReason,
} from "@/lib/funnel";
import type { PublicLead } from "@/server/controllers/presenters";
import { Alert, Button, Modal, SelectField, TextField } from "./ui";

/** `R$ 350.000,50` → `350000.5`; texto vazio ou inválido → `NaN`. */
export function parseMoney(text: string): number {
  const cleaned = text.replace(/[R$\s.]/g, "").replace(",", ".");
  return cleaned ? Number(cleaned) : Number.NaN;
}

const textareaStyles =
  "block w-full resize-y rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

function TextArea({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${textareaStyles} ${error ? "border-red-500" : "border-gray-300"}`}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

type Props = {
  leadId: string;
  outcome: "GANHO" | "PERDIDO";
  onClose: () => void;
  onSaved: (lead: PublicLead) => void;
};

/** Pede os dados do desfecho antes de marcar o contato como Ganho ou Perdido. */
export function CloseLeadDialog({ leadId, outcome, onClose, onSaved }: Props) {
  const [wonType, setWonType] = useState<DealType>("COMPRA");
  const [wonValue, setWonValue] = useState("");
  const [wonConditions, setWonConditions] = useState("");
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostNote, setLostNote] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    const value = parseMoney(wonValue);
    const body =
      outcome === "GANHO"
        ? {
            stage: outcome,
            wonType,
            // null deixa o servidor responder "Informe o valor." no campo certo.
            wonValue: Number.isFinite(value) ? value : null,
            wonConditions,
          }
        : { stage: outcome, lostReason: lostReason || null, lostNote };
    try {
      const { lead } = await api<{ lead: PublicLead }>(
        `/api/leads/${encodeURIComponent(leadId)}/etapa`,
        { method: "PATCH", body },
      );
      onSaved(lead);
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0) {
        setFields(caught.fields);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={outcome === "GANHO" ? "Marcar como ganho" : "Marcar como perdido"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        {outcome === "GANHO" ? (
          <>
            <SelectField
              label="Negócio"
              value={wonType}
              onChange={(event) => setWonType(event.target.value as DealType)}
              error={fields.wonType}
            >
              {DEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DEAL_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Valor (R$)"
              inputMode="decimal"
              placeholder="350.000,00"
              value={wonValue}
              onChange={(event) => setWonValue(event.target.value)}
              error={fields.wonValue}
            />
            <TextArea
              label="Condições (opcional)"
              value={wonConditions}
              onChange={setWonConditions}
              error={fields.wonConditions}
            />
          </>
        ) : (
          <>
            <SelectField
              label="Motivo"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value as LostReason)}
              error={fields.lostReason}
            >
              <option value="">Selecione…</option>
              {LOST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {LOST_REASON_LABELS[reason]}
                </option>
              ))}
            </SelectField>
            <TextArea
              label={lostReason === "OUTRO" ? "Observação" : "Observação (opcional)"}
              value={lostNote}
              onChange={setLostNote}
              error={fields.lostNote}
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
