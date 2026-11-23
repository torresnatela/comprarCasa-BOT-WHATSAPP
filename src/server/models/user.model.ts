import { and, asc, count, eq, sql } from "drizzle-orm";
import { leads, type NewUser, type User, users } from "../db/schema";
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

/** Vendedor ativo e na fila do rodízio. */
const inRotation = and(
  eq(users.role, "VENDEDOR"),
  eq(users.status, "ATIVO"),
  eq(users.inRotation, true),
);

/** Ordem do rodízio: quem recebeu lead há mais tempo (ou nunca recebeu) vem primeiro. */
const rotationOrder = [
  sql`${users.lastAssignedAt} ASC NULLS FIRST`,
  asc(users.createdAt),
  asc(users.id),
];

export type RotationEntry = {
  user: User;
  assignedLeads: number;
};

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

    /**
     * Próximo vendedor do rodízio, travado até o fim da transação. Duas
     * distribuições simultâneas nunca escolhem o mesmo vendedor.
     */
    async lockNextInRotation(): Promise<User | null> {
      const [user] = await db
        .select()
        .from(users)
        .where(inRotation)
        .orderBy(...rotationOrder)
        .limit(1)
        .for("update", { skipLocked: true });
      return user ?? null;
    },

    async markAssigned(id: string, at: Date): Promise<void> {
      await db.update(users).set({ lastAssignedAt: at }).where(eq(users.id, id));
    },

    /** Vendedores ativos na ordem do rodízio (os fora da fila vêm no fim). */
    async listRotation(): Promise<RotationEntry[]> {
      const rows = await db
        .select({ user: users, assignedLeads: count(leads.id) })
        .from(users)
        .leftJoin(leads, eq(leads.assignedTo, users.id))
        .where(and(eq(users.role, "VENDEDOR"), eq(users.status, "ATIVO")))
        .groupBy(users.id)
        .orderBy(sql`${users.inRotation} DESC`, ...rotationOrder);
      return rows;
    },

    async setInRotation(id: string, value: boolean): Promise<User | null> {
      const [user] = await db
        .update(users)
        .set({ inRotation: value, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return user ?? null;
    },
  };
}

export type UserModel = ReturnType<typeof userModel>;
