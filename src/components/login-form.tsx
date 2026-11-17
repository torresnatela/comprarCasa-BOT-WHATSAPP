"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { Alert, Button, TextField } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFields({});
    setFailure(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.replace("/");
      router.refresh();
    } catch (error) {
      const fieldErrors = error instanceof ApiError ? error.fields : {};
      setFields(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFailure(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {failure && <Alert>{failure}</Alert>}
      <TextField
        label="E-mail"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fields.email}
        required
      />
      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fields.password}
        required
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
