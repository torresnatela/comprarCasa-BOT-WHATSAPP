import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { AuthCard } from "@/components/auth-card";

export const metadata: Metadata = {
  title: "Criar acesso — comprarCasa",
  // O link carrega um token; não deve ser indexado nem vazar por Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function InviteForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInviteForm token={token} />;
}

export default function InvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <AuthCard title="Criar seu acesso">
      <Suspense
        fallback={<p className="text-sm text-gray-600">Verificando seu convite…</p>}
      >
        <InviteForm params={params} />
      </Suspense>
    </AuthCard>
  );
}
