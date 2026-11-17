"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { WhatsappStatus } from "@/server/services/whatsapp.service";
import { Alert, Button } from "./ui";

function Badge({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        ok
          ? "bg-brand-50 text-brand-700 ring-brand-100"
          : "bg-amber-50 text-amber-800 ring-amber-200"
      }`}
    >
      {children}
    </span>
  );
}

export function WhatsappSettings() {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await api<{ status: WhatsappStatus }>("/api/whatsapp/status");
      setStatus(result.status);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Carga inicial: o estado só muda depois da resposta da API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function register() {
    setSaving(true);
    setActionError(null);
    try {
      const result = await api<{ status: WhatsappStatus }>("/api/whatsapp/webhook", {
        method: "POST",
      });
      setStatus(result.status);
      setConfirming(false);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">WhatsApp</h1>
      <p className="text-sm text-gray-600">
        Conexão do portal com o número da imobiliária, pela Evolution API.
      </p>
    </div>
  );

  if (loadError) {
    return (
      <section className="space-y-4">
        {header}
        <Alert>{loadError}</Alert>
        <Button variant="secondary" onClick={load}>
          Tentar de novo
        </Button>
      </section>
    );
  }
  if (!status) {
    return (
      <section className="space-y-4">
        {header}
        <p className="text-sm text-gray-600">Consultando a Evolution API…</p>
      </section>
    );
  }

  if (!status.configured) {
    return (
      <section className="space-y-4">
        {header}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">A integração ainda não foi configurada.</p>
          <p className="mt-1">
            Defina estas variáveis de ambiente no servidor e faça um novo deploy:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
            {status.missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  const { webhook } = status;
  const foreign = webhook !== null && !webhook.pointsHere;
  const active = webhook !== null && webhook.pointsHere && webhook.enabled;

  return (
    <section className="space-y-4">
      {header}
      {actionError && <Alert>{actionError}</Alert>}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-500">Instância</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="font-medium text-gray-900">{status.instance}</p>
          <Badge ok={status.connected}>
            {status.connected ? "Conectada" : "Desconectada"}
          </Badge>
        </div>
        {!status.connected && (
          <p className="mt-2 text-sm text-gray-600">
            O número não está conectado ao WhatsApp. Reconecte a instância no
            painel da Evolution API.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-500">Recebimento de mensagens</h2>

        {active ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium text-gray-900">
              Recebendo mensagens neste portal
            </p>
            <Badge ok>Ativo</Badge>
          </div>
        ) : foreign ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-gray-900">
              A instância envia as mensagens para outro sistema:
            </p>
            <p className="break-all font-mono text-xs text-gray-700">{webhook.url}</p>
            <p className="text-gray-600">
              Registrar o portal substitui esse endereço; o outro sistema deixa de
              receber as mensagens.
            </p>
          </div>
        ) : (
          <p className="font-medium text-gray-900">Nenhum webhook registrado</p>
        )}

        <div className="text-sm text-gray-600">
          <p>Endereço deste portal para a Evolution API:</p>
          <p className="break-all font-mono text-xs text-gray-700">{status.webhookUrl}</p>
        </div>

        {foreign && confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={register} disabled={saving}>
              {saving ? "Substituindo…" : "Sim, substituir"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        ) : foreign ? (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Substituir webhook
          </Button>
        ) : (
          <Button
            variant={active ? "secondary" : "primary"}
            onClick={register}
            disabled={saving}
          >
            {saving
              ? "Registrando…"
              : active
                ? "Registrar novamente"
                : "Registrar webhook"}
          </Button>
        )}
      </div>
    </section>
  );
}
