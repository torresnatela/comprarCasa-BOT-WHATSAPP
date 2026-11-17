import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Database } from "./types";

let cached: { pool: Pool; db: Database } | undefined;

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida.");
  }
  const pool = new Pool({ connectionString, max: 5 });
  return { pool, db: drizzle(pool, { schema }) as Database };
}

/** Conexão única por processo, criada só no primeiro uso. */
export function getDb(): Database {
  cached ??= connect();
  return cached.db;
}

export async function closeDb(): Promise<void> {
  await cached?.pool.end();
  cached = undefined;
}
