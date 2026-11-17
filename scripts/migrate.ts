import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/server/db/client";

async function main() {
  // O migrator só precisa da conexão; o tipo comum não expõe o driver.
  await migrate(getDb() as never, {
    migrationsFolder: "src/server/db/migrations",
  });
  console.log("Migrations aplicadas.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
