import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/types";

export type TestDb = {
  db: Database;
  /** Apaga todos os dados, mantendo o schema. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
};

/** Postgres em memória com as migrations reais aplicadas. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "src/server/db/migrations" });

  return {
    db: db as unknown as Database,
    reset: async () => {
      await db.execute(sql`TRUNCATE TABLE invites, sessions, users CASCADE`);
    },
    close: () => client.close(),
  };
}
