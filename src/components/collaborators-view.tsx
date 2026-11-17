"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatPhone, ROLE_LABELS, STATUS_LABELS } from "@/lib/format";
import type { PublicUser } from "@/server/controllers/presenters";
import type { UserStatus } from "@/lib/roles";
import { CollaboratorForm } from "./collaborator-form";
import { type InviteLink, InviteLinkDialog } from "./invite-link-dialog";
import { Alert, Button } from "./ui";

type Dialog =
  | { kind: "form"; collaborator?: PublicUser }
  | { kind: "invite"; collaboratorName: string; invite: InviteLink }
  | null;

const statusStyles: Record<UserStatus, string> = {
  ATIVO: "bg-brand-50 text-brand-700 ring-brand-100",
  PENDENTE: "bg-amber-50 text-amber-800 ring-amber-200",
  INATIVO: "bg-gray-100 text-gray-600 ring-gray-200",
};

const byName = (a: PublicUser, b: PublicUser) =>
  a.name.localeCompare(b.name, "pt-BR");

export function CollaboratorsView({ currentUserId }: { currentUserId: string }) {
  const [collaborators, setCollaborators] = useState<PublicUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await api<{ collaborators: PublicUser[] }>("/api/colaboradores");
      setCollaborators(result.collaborators);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Carga inicial: o estado só muda depois da resposta da API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const closeDialog = useCallback(() => setDialog(null), []);

  function upsert(collaborator: PublicUser) {
    setCollaborators((current) =>
      [
        ...(current ?? []).filter((item) => item.id !== collaborator.id),
        collaborator,
      ].sort(byName),
    );
  }

  /** Roda uma ação de linha, mostrando o motivo se o servidor recusar. */
  async function runRowAction(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const setActive = (collaborator: PublicUser, active: boolean) =>
    runRowAction(collaborator.id, async () => {
      const result = await api<{ collaborator: PublicUser }>(
        `/api/colaboradores/${collaborator.id}`,
        { method: "PATCH", body: { active } },
      );
      upsert(result.collaborator);
    });

  const generateLink = (collaborator: PublicUser) =>
    runRowAction(collaborator.id, async () => {
      const result = await api<{ invite: InviteLink }>(
        `/api/colaboradores/${collaborator.id}/convite`,
        { method: "POST" },
      );
      setDialog({
        kind: "invite",
        collaboratorName: collaborator.name,
        invite: result.invite,
      });
    });

  function onSaved(collaborator: PublicUser, invite?: InviteLink) {
    upsert(collaborator);
    setDialog(
      invite
        ? { kind: "invite", collaboratorName: collaborator.name, invite }
        : null,
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Colaboradores</h1>
          <p className="text-sm text-gray-600">
            Gestores e vendedores com acesso ao portal.
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "form" })}>Novo colaborador</Button>
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      {loadError ? (
        <div className="space-y-3">
          <Alert>{loadError}</Alert>
          <Button variant="secondary" onClick={load}>
            Tentar de novo
          </Button>
        </div>
      ) : collaborators === null ? (
        <p className="text-sm text-gray-600">Carregando colaboradores…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                <th scope="col" className="px-4 py-3 font-medium">E-mail</th>
                <th scope="col" className="px-4 py-3 font-medium">WhatsApp</th>
                <th scope="col" className="px-4 py-3 font-medium">Papel</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {collaborators.map((collaborator) => {
                const isSelf = collaborator.id === currentUserId;
                const inactive = collaborator.status === "INATIVO";
                const busy = busyId === collaborator.id;
                return (
                  <tr key={collaborator.id} className={inactive ? "text-gray-500" : ""}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      {collaborator.name}
                    </td>
                    <td className="px-4 py-3">{collaborator.email}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatPhone(collaborator.phone)}
                    </td>
                    <td className="px-4 py-3">{ROLE_LABELS[collaborator.role]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[collaborator.status]}`}
                      >
                        {STATUS_LABELS[collaborator.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="px-2.5 py-1.5"
                          aria-label={`Editar ${collaborator.name}`}
                          onClick={() => setDialog({ kind: "form", collaborator })}
                        >
                          Editar
                        </Button>
                        {!inactive && (
                          <Button
                            variant="ghost"
                            className="whitespace-nowrap px-2.5 py-1.5"
                            aria-label={`Gerar link de acesso para ${collaborator.name}`}
                            disabled={busy}
                            onClick={() => generateLink(collaborator)}
                          >
                            Gerar link
                          </Button>
                        )}
                        {isSelf ? (
                          <span className="px-2.5 text-xs font-medium text-gray-500">
                            Você
                          </span>
                        ) : inactive ? (
                          <Button
                            variant="ghost"
                            className="px-2.5 py-1.5"
                            aria-label={`Reativar ${collaborator.name}`}
                            disabled={busy}
                            onClick={() => setActive(collaborator, true)}
                          >
                            Reativar
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            className="px-2.5 py-1.5"
                            aria-label={`Desativar ${collaborator.name}`}
                            disabled={busy}
                            onClick={() => setActive(collaborator, false)}
                          >
                            Desativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "form" && (
        <CollaboratorForm
          key={dialog.collaborator?.id ?? "novo"}
          collaborator={dialog.collaborator}
          onClose={closeDialog}
          onSaved={onSaved}
        />
      )}
      {dialog?.kind === "invite" && (
        <InviteLinkDialog
          collaboratorName={dialog.collaboratorName}
          invite={dialog.invite}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}
