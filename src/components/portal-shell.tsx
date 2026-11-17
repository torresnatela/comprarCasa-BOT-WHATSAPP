"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { api } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import type { PublicUser } from "@/server/controllers/presenters";
import { Button } from "./ui";

type Props = { user: PublicUser; children: ReactNode };

export function PortalShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const links = [
    { href: "/", label: "Início" },
    ...(user.role === "GESTOR"
      ? [{ href: "/colaboradores", label: "Colaboradores" }]
      : []),
  ];

  async function logout() {
    setLeaving(true);
    // Mesmo que a chamada falhe, a tela de login é o destino certo.
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-brand-700">
            comprarCasa
          </Link>
          <nav aria-label="Principal" className="flex gap-1">
            {links.map((link) => {
              const current = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    current
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <Button variant="secondary" onClick={logout} disabled={leaving}>
              {leaving ? "Saindo…" : "Sair"}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
