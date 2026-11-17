"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { Button, Modal, TextField } from "./ui";

export type InviteLink = { url: string; expiresAt: string };

type Props = {
  collaboratorName: string;
  invite: InviteLink;
  onClose: () => void;
};

export function InviteLinkDialog({ collaboratorName, invite, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      // Sem permissão de área de transferência: o link continua visível
      // e selecionável no campo para ser copiado manualmente.
      setCopied(false);
    }
  }

  return (
    <Modal title="Link de acesso" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Envie este link para <strong className="font-medium text-gray-900">{collaboratorName}</strong>{" "}
          criar a própria senha. Ele só aparece agora e vale para um único uso.
        </p>
        <TextField
          label="Link de acesso"
          readOnly
          value={invite.url}
          onFocus={(event) => event.currentTarget.select()}
          hint={`Válido até ${formatDateTime(invite.expiresAt)}.`}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={copy}>{copied ? "Link copiado" : "Copiar link"}</Button>
        </div>
      </div>
    </Modal>
  );
}
