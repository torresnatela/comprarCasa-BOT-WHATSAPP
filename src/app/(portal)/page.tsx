import Link from "next/link";
import { formatPhone, ROLE_LABELS } from "@/lib/format";
import { requirePageUser } from "@/server/http/current-user";

export default async function HomePage() {
  const user = await requirePageUser();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Olá, {firstName}</h1>
        <p className="text-sm text-gray-600">
          {user.role === "GESTOR"
            ? "Gerencie a equipe que vai receber os leads do WhatsApp."
            : "Aqui você vai acompanhar os leads que o rodízio enviar para você."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-500">Seus dados</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Nome</dt>
              <dd className="text-right font-medium text-gray-900">{user.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">E-mail</dt>
              <dd className="text-right text-gray-900">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">WhatsApp</dt>
              <dd className="text-right text-gray-900">{formatPhone(user.phone)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Papel</dt>
              <dd className="text-right text-gray-900">{ROLE_LABELS[user.role]}</dd>
            </div>
          </dl>
        </section>

        {user.role === "GESTOR" && (
          <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-medium text-gray-500">Equipe</h2>
            <p className="mt-3 flex-1 text-sm text-gray-700">
              Cadastre gestores e vendedores e envie o link para cada um criar a
              própria senha.
            </p>
            <Link
              href="/colaboradores"
              className="mt-4 text-sm font-medium text-brand-700 hover:underline"
            >
              Gerenciar colaboradores →
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
