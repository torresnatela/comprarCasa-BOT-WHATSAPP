"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatPhone } from "@/lib/format";
import type { PublicRotationEntry } from "@/server/controllers/presenters";
import { Alert, Button } from "./ui";

type Sellers = { sellers: PublicRotationEntry[] };

/** Fila do rodízio: quem recebe o próximo lead e quem está fora da fila. */
export function RotationView() {
  const [sellers, setSellers] = useState<PublicRotationEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSellers((await api<Sellers>("/api/rodizio")).sellers);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Carga inicial: o estado só muda depois da resposta da API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(seller: PublicRotationEntry) {
    setBusyId(seller.id);
    setActionError(null);
    try {
      const result = await api<Sellers>(`/api/rodizio/${seller.id}`, {
        method: "PATCH",
        body: { inRotation: !seller.inRotation },
      });
      setSellers(result.sellers);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rodízio</h1>
        <p className="text-sm text-gray-600">
          Depois da qualificação pela assistente, cada lead vai para o próximo vendedor
          da fila: quem recebeu há mais tempo é o primeiro.
        </p>
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      {loadError ? (
        <div className="space-y-3">
          <Alert>{loadError}</Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Tentar de novo
          </Button>
        </div>
      ) : sellers === null ? (
        <p className="text-sm text-gray-600">Carregando fila…</p>
      ) : sellers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="font-medium text-gray-900">Nenhum vendedor ativo</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
            Sem vendedores na fila, os leads qualificados ficam aguardando.
          </p>
          <Link
            href="/colaboradores"
            className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            Cadastrar vendedores
          </Link>
        </div>
      ) : (
        <ol
          aria-label="Fila do rodízio"
          className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
          {sellers.map((seller) => (
            <li key={seller.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <span
                aria-label={seller.position ? `Posição ${seller.position}` : "Fora da fila"}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  seller.position === 1
                    ? "bg-brand-600 text-white"
                    : seller.position
                      ? "bg-brand-50 text-brand-700"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {seller.position ?? "–"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">
                  {seller.name}
                  {seller.position === 1 && (
                    <span className="ml-2 text-xs font-medium text-brand-700">próximo</span>
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  {formatPhone(seller.phone)} · {seller.assignedLeads}{" "}
                  {seller.assignedLeads === 1 ? "lead recebido" : "leads recebidos"}
                  {seller.lastAssignedAt && ` · último em ${formatDateTime(seller.lastAssignedAt)}`}
                </p>
              </div>
              <Button
                variant={seller.inRotation ? "secondary" : "primary"}
                disabled={busyId === seller.id}
                onClick={() => void toggle(seller)}
              >
                {seller.inRotation ? "Tirar da fila" : "Colocar na fila"}
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
