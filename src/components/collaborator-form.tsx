"use client";

import { type FormEvent, useState } from "react";
import {
  DEFAULT_MESSAGE_ACCESS,
  MESSAGE_ACCESS_LABELS,
  MESSAGE_ACCESS_LEVELS,
  type MessageAccess,
} from "@/lib/access";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatPhone, ROLE_LABELS } from "@/lib/format";
import type { PublicUser } from "@/server/controllers/presenters";
import { USER_ROLES, type UserRole } from "@/lib/roles";
import type { InviteLink } from "./invite-link-dialog";
import { Alert, Button, Modal, SelectField, TextField } from "./ui";

type Props = {
  /** Colaborador em edição; sem ele, o formulário cadastra um novo. */
  collaborator?: PublicUser;
  onClose: () => void;
  onSaved: (collaborator: PublicUser, invite?: InviteLink) => void;
};

export function CollaboratorForm({ collaborator, onClose, onSaved }: Props) {
  const editing = Boolean(collaborator);
  const [name, setName] = useState(collaborator?.name ?? "");
  const [email, setEmail] = useState(collaborator?.email ?? "");
  const [phone, setPhone] = useState(
    collaborator?.phone ? formatPhone(collaborator.phone) : "",
  );
  const [role, setRole] = useState<UserRole>(collaborator?.role ?? "VENDEDOR");
  const [messageAccess, setMessageAccess] = useState<MessageAccess>(
    collaborator?.messageAccess ?? DEFAULT_MESSAGE_ACCESS,
  );
  const [fields, setFields] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFields({});
    setFailure(null);
    try {
      if (collaborator) {
        // Quem ainda não tem telefone cadastrado pode salvar sem informar um.
        const keepEmptyPhone = !collaborator.phone && !phone.trim();
        const result = await api<{ collaborator: PublicUser }>(
          `/api/colaboradores/${collaborator.id}`,
          {
            method: "PATCH",
            body: {
              name,
              email,
              role,
              messageAccess,
              ...(keepEmptyPhone ? {} : { phone }),
            },
          },
        );
        onSaved(result.collaborator);
      } else {
        const result = await api<{ collaborator: PublicUser; invite: InviteLink }>(
          "/api/colaboradores",
          { method: "POST", body: { name, email, phone, role, messageAccess } },
        );
        onSaved(result.collaborator, result.invite);
      }
    } catch (error) {
      const fieldErrors = error instanceof ApiError ? error.fields : {};
      setFields(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFailure(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={editing ? "Editar colaborador" : "Novo colaborador"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {failure && <Alert>{failure}</Alert>}
        <TextField
          label="Nome completo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fields.name}
          autoFocus
          required
        />
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
          hint="Será o login do colaborador."
          required
        />
        <TextField
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          placeholder="(11) 99999-9999"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={fields.phone}
          hint="Com DDD. É por ele que o vendedor receberá os leads."
        />
        <SelectField
          label="Papel"
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole)}
          error={fields.role}
          hint="Gestor administra o portal; vendedor recebe leads do rodízio."
        >
          {USER_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </SelectField>
        {role === "VENDEDOR" && (
          <SelectField
            label="Acesso às mensagens"
            value={messageAccess}
            onChange={(event) => setMessageAccess(event.target.value as MessageAccess)}
            error={fields.messageAccess}
            hint="Quais conversas do WhatsApp o vendedor vê e responde pelo portal."
          >
            {MESSAGE_ACCESS_LEVELS.map((value) => (
              <option key={value} value={value}>
                {MESSAGE_ACCESS_LABELS[value]}
              </option>
            ))}
          </SelectField>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Salvando…"
              : editing
                ? "Salvar"
                : "Cadastrar e gerar link"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
