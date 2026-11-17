import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Tipo comum a qualquer driver (pg em produção, PGlite nos testes) e também
 * às transações, para que models e services sejam injetáveis.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
