"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { Alert, Button, TextField } from "./ui";

type InviteInfo = { name: string; email: string; expiresAt: string };

type State =
  | { step: "loading" }
  | { step: "invalid"; message: string }
  | { step: "ready"; invite: InviteInfo };

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const path = `/api/convites/${encodeURIComponent(token)}`;
  const [state, setState] = useState<State>({ step: "loading" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ invite: InviteInfo }>(path)
      .then(({ invite }) => {
        if (!cancelled) setState({ step: "ready", invite });
      })
      .catch((error) => {
        if (!cancelled) setState({ step: "invalid", message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordError(undefined);
    setConfirmationError(undefined);
    setFailure(null);
    if (password !== confirmation) {
      setConfirmationError("As senhas não são iguais.");
      return;
    }
    setSubmitting(true);
    try {
      await api(path, { method: "POST", body: { password } });
      router.replace("/");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields.password) {
        setPasswordError(error.fields.password);
      } else if (error instanceof ApiError && error.status === 410) {
        setState({ step: "invalid", message: error.message });
      } else {
        setFailure(errorMessage(error));
      }
      setSubmitting(false);
    }
  }

  if (state.step === "loading") {
    return <p className="text-sm text-gray-600">Verificando seu convite…</p>;
  }

  if (state.step === "invalid") {
    return (
      <div className="space-y-4">
        <Alert>{state.message}</Alert>
        <p className="text-sm text-gray-600">
          Peça ao gestor da imobiliária para gerar um novo link de acesso.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <p className="text-base font-medium text-gray-900">
          Olá, {state.invite.name}!
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Crie uma senha para acessar o portal. Seu login será{" "}
          <strong className="font-medium text-gray-900">{state.invite.email}</strong>
        </p>
      </div>
      {failure && <Alert>{failure}</Alert>}
      <TextField
        label="Crie sua senha"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={passwordError}
        hint="Pelo menos 8 caracteres."
        required
      />
      <TextField
        label="Repita a senha"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        error={confirmationError}
        required
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Salvando…" : "Criar senha e entrar"}
      </Button>
    </form>
  );
}
