import { type NewUser, type User, users } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

let sequence = 0;

export async function createUser(
  db: Database,
  overrides: Partial<NewUser> = {},
): Promise<User> {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({
      name: `Pessoa ${sequence}`,
      email: `pessoa${sequence}@exemplo.com`,
      phone: `5511900000${String(sequence).padStart(3, "0")}`,
      role: "VENDEDOR",
      status: "ATIVO",
      ...overrides,
    })
    .returning();
  return user;
}
