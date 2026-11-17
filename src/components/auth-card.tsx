import type { ReactNode } from "react";

/** Moldura das telas públicas (login e convite). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-semibold text-brand-700">
          comprarCasa
        </p>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold text-gray-900">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
