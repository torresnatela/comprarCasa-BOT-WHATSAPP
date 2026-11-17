import { and, asc, count, eq } from "drizzle-orm";
import { type NewUser, type User, users } from "../db/schema";
import type { Database } from "../db/types";
import { ConflictError } from "../http/errors";
import { isUniqueViolation } from "./db-errors";

export type UserPatch = Partial<
  Pick<NewUser, "name" | "email" | "phone" | "role" | "status" | "passwordHash">
>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function translatingConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "EMAIL_IN_USE",
        "Já existe um colaborador com este e-mail.",
      );
    }
    throw error;
  }
}

export function userModel(db: Database) {
  return {
    async create(data: NewUser): Promise<User> {
      const [user] = await translatingConflict(() =>
        db
          .insert(users)
          .values({ ...data, email: normalizeEmail(data.email) })
          .returning(),
      );
      return user;
    },

    async findById(id: string): Promise<User | null> {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user ?? null;
    },

    async findByEmail(email: string): Promise<User | null> {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizeEmail(email)));
      return user ?? null;
    },

    async list(): Promise<User[]> {
      return db.select().from(users).orderBy(asc(users.name));
    },

    async update(id: string, patch: UserPatch): Promise<User | null> {
      const values = {
        ...patch,
        ...(patch.email !== undefined && { email: normalizeEmail(patch.email) }),
        updatedAt: new Date(),
      };
      const [user] = await translatingConflict(() =>
        db.update(users).set(values).where(eq(users.id, id)).returning(),
      );
      return user ?? null;
    },

    async countActiveGestores(): Promise<number> {
      const [row] = await db
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, "GESTOR"), eq(users.status, "ATIVO")));
      return row.total;
    },
  };
}

export type UserModel = ReturnType<typeof userModel>;
