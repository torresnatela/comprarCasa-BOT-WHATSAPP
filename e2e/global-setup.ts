import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/server/db/client";
import { seedFirstManager } from "../src/server/db/seed";
import { createPasswordHasher } from "../src/server/services/password";
import { E2E_DATABASE_URL, MANAGER } from "./env";

/** Deixa o banco de E2E migrado, vazio e com um gestor para o login. */
export default async function globalSetup() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const db = getDb();
  try {
    await migrate(db as never, { migrationsFolder: "src/server/db/migrations" });
    await db.execute(sql`TRUNCATE TABLE invites, sessions, users CASCADE`);
    await seedFirstManager(db, createPasswordHasher(), MANAGER);
  } finally {
    await closeDb();
  }
}
