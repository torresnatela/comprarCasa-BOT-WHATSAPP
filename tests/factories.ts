import {
  type Lead,
  leads,
  type NewLead,
  type NewUser,
  type User,
  users,
} from "@/server/db/schema";
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

export async function createLead(
  db: Database,
  overrides: Partial<NewLead> = {},
): Promise<Lead> {
  sequence += 1;
  const phone = `3519100000${String(sequence).padStart(2, "0")}`;
  const [lead] = await db
    .insert(leads)
    .values({
      whatsappJid: `${phone}@s.whatsapp.net`,
      phone,
      name: `Lead ${sequence}`,
      lastMessageAt: new Date("2026-11-17T10:00:00Z"),
      lastMessageText: "Olá",
      ...overrides,
    })
    .returning();
  return lead;
}
