import { z } from "zod";
import { userModel } from "../models/user.model";
import type { PasswordHasher } from "../services/password";
import { passwordSchema } from "../validation/schemas";
import type { Database } from "./types";

const seedSchema = z.object({
  name: z.string().trim().min(2, "SEED_ADMIN_NAME é obrigatório."),
  email: z.email("SEED_ADMIN_EMAIL inválido."),
  password: passwordSchema,
});

/** Cria o primeiro gestor do portal. É seguro rodar mais de uma vez. */
export async function seedFirstManager(
  db: Database,
  hasher: PasswordHasher,
  input: { name?: string; email?: string; password?: string },
): Promise<"created" | "exists"> {
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }
  const { name, email, password } = parsed.data;
  const users = userModel(db);

  if (await users.findByEmail(email)) return "exists";

  await users.create({
    name,
    email,
    phone: "",
    role: "GESTOR",
    status: "ATIVO",
    passwordHash: await hasher.hash(password),
  });
  return "created";
}
