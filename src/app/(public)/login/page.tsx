import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/server/http/current-user";

export const metadata: Metadata = { title: "Entrar — comprarCasa" };

/** Quem já está logado não precisa ver o formulário. */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}

export default function LoginPage() {
  return (
    <AuthCard title="Entrar no portal">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <LoginForm />
    </AuthCard>
  );
}
