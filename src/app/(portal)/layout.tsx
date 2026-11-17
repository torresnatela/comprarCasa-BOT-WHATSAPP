import { type ReactNode, Suspense } from "react";
import { PortalShell } from "@/components/portal-shell";
import { requirePageUser } from "@/server/http/current-user";

/** Todas as telas do portal passam por aqui: sem sessão válida, vai para o login. */
async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return <PortalShell user={user}>{children}</PortalShell>;
}

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={<p className="p-8 text-center text-sm text-gray-600">Carregando…</p>}
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
