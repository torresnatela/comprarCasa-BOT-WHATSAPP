import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/server/db/client";
import { seedFirstManager } from "../src/server/db/seed";
import { createPasswordHasher } from "../src/server/services/password";
import { users } from "../src/server/db/schema";
import { E2E_DATABASE_URL, MANAGER, SELLER } from "./env";

/** Deixa o banco de E2E migrado, vazio, com um gestor para o login e um vendedor no rodízio. */
export default async function globalSetup() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const db = getDb();
  try {
    await migrate(db as never, { migrationsFolder: "src/server/db/migrations" });
    await db.execute(sql`TRUNCATE TABLE lead_tasks, messages, leads, invites, sessions, users CASCADE`);
    await seedFirstManager(db, createPasswordHasher(), MANAGER);
    await db.insert(users).values({ ...SELLER, role: "VENDEDOR", status: "ATIVO" });
  } finally {
    await closeDb();
  }
}
