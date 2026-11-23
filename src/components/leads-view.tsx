"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { LEAD_STAGES, type LeadStage, STAGE_LABELS } from "@/lib/funnel";
import { formatDateTime, formatPhone, leadTitle } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import type { PublicLead } from "@/server/controllers/presenters";
import { PausedBadge, StageBadge, TaskDueBadge } from "./funnel-badges";
import { Alert, Button } from "./ui";

const REFRESH_MS = 10_000;

export function LeadsView() {
  const [leads, setLeads] = useState<PublicLead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("TODOS");
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await api<{ leads: PublicLead[] }>("/api/leads");
      loaded.current = true;
      setLeads(result.leads);
      setLoadError(null);
    } catch (error) {
      // Numa atualização em segundo plano, mantém a lista que já está na tela.
      if (!loaded.current) setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Carga inicial: o estado só muda depois da resposta da API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  usePolling(load, REFRESH_MS);

  const visible =
    leads && (filter === "TODOS" ? leads : leads.filter((lead) => lead.stage === filter));
  const tabs = [
    { value: "TODOS" as const, label: "Todos", count: leads?.length ?? 0 },
    ...LEAD_STAGES.map((stage) => ({
      value: stage,
      label: STAGE_LABELS[stage],
      count: leads?.filter((lead) => lead.stage === stage).length ?? 0,
    })),
  ];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-600">
          Pessoas que escreveram para o WhatsApp da imobiliária.
        </p>
      </div>

      {loadError ? (
        <div className="space-y-3">
          <Alert>{loadError}</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              setLoadError(null);
              void load();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : leads === null ? (
        <p className="text-sm text-gray-600">Carregando leads…</p>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="font-medium text-gray-900">Nenhum lead ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
            Quando alguém escrever para o WhatsApp da imobiliária, a conversa
            aparece aqui.
          </p>
          <Link
            href="/whatsapp"
            className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            Conferir a conexão do WhatsApp
          </Link>
        </div>
      ) : (
        <>
          <StageTabs tabs={tabs} value={filter} onChange={setFilter} />
          {visible?.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
              Nenhum contato nesta etapa.
            </p>
          ) : (
            <LeadList leads={visible ?? []} />
          )}
        </>
      )}
    </section>
  );
}

type Filter = LeadStage | "TODOS";

function StageTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: Filter; label: string; count: number }[];
  value: Filter;
  onChange: (value: Filter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Etapas do funil"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
            value === tab.value
              ? "bg-brand-600 text-white"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          {tab.label} <span className="opacity-75">{tab.count}</span>
        </button>
      ))}
    </div>
  );
}

function LeadList({ leads }: { leads: PublicLead[] }) {
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {leads.map((lead) => (
        <li key={lead.id}>
          <Link
            href={`/leads/${lead.id}`}
            className="flex items-start gap-4 px-4 py-3 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{leadTitle(lead)}</p>
              <p className="truncate text-sm text-gray-600">{lead.lastMessageText}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StageBadge stage={lead.stage} />
                {lead.stage === "QUALIFICACAO" && lead.automationPaused && <PausedBadge />}
                <TaskDueBadge due={lead.nextTaskDue} />
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-500">
              {lead.name && lead.phone && <p>{formatPhone(lead.phone)}</p>}
              <p>{formatDateTime(lead.lastMessageAt)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
