const UNIQUE_VIOLATION = "23505";

/** Reconhece violação de UNIQUE tanto do `pg` quanto do PGlite (direta ou em `cause`). */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
