/**
 * Dá a esta rota um limite de Suspense próprio, abaixo do layout do portal,
 * para a navegação vinda de outras telas não ficar bloqueada na sessão.
 */
export default function Loading() {
  return <p className="text-sm text-gray-600">Carregando colaboradores…</p>;
}
