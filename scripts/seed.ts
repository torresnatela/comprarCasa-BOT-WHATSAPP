import { closeDb, getDb } from "../src/server/db/client";
import { seedFirstManager } from "../src/server/db/seed";
import { createPasswordHasher } from "../src/server/services/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const result = await seedFirstManager(getDb(), createPasswordHasher(), {
    name: process.env.SEED_ADMIN_NAME ?? "Gestor",
    email,
    password: process.env.SEED_ADMIN_PASSWORD,
  });
  console.log(
    result === "created"
      ? `Gestor ${email} criado.`
      : `Gestor ${email} já existia; nada foi alterado.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
