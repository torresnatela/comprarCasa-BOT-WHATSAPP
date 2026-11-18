import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { USER_ROLES, USER_STATUSES } from "../../lib/roles";

export { USER_ROLES, USER_STATUSES };
export type { UserRole, UserStatus } from "../../lib/roles";

export const userRole = pgEnum("user_role", USER_ROLES);
export const userStatus = pgEnum("user_status", USER_STATUSES);

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  role: userRole("role").notNull(),
  status: userStatus("status").notNull().default("PENDENTE"),
  passwordHash: text("password_hash"),
  /** Vendedor participa do rodízio de leads (o gestor liga/desliga na fila). */
  inRotation: boolean("in_rotation").notNull().default(true),
  /** Quando recebeu o último lead do rodízio: quem recebeu há mais tempo é o próximo. */
  lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt,
});

export const MESSAGE_DIRECTIONS = ["RECEBIDA", "ENVIADA"] as const;
export const MESSAGE_TYPES = ["TEXTO", "OUTRO"] as const;

/**
 * Etapa do lead:
 * - QUALIFICANDO: a IA está conversando para entender o que ele procura;
 * - AGUARDANDO_VENDEDOR: qualificado, mas não havia vendedor na fila;
 * - DISTRIBUIDO: entregue a um vendedor pelo rodízio;
 * - HUMANO: um colaborador assumiu a conversa (a IA não responde mais).
 */
export const LEAD_STAGES = [
  "QUALIFICANDO",
  "AGUARDANDO_VENDEDOR",
  "DISTRIBUIDO",
  "HUMANO",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** O que a IA apurou na qualificação. Todos os campos são opcionais. */
export type Qualification = {
  objetivo?: string | null;
  tipoImovel?: string | null;
  regiao?: string | null;
  faixaValor?: string | null;
  pagamento?: string | null;
  prazo?: string | null;
  observacoes?: string | null;
};

export const leadStage = pgEnum("lead_stage", LEAD_STAGES);
export const messageDirection = pgEnum("message_direction", MESSAGE_DIRECTIONS);
export const messageType = pgEnum("message_type", MESSAGE_TYPES);

/** Contato que falou com o WhatsApp da imobiliária. Uma conversa por lead. */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Identificador da conversa no WhatsApp; é para ele que as respostas vão. */
  whatsappJid: text("whatsapp_jid").notNull().unique(),
  /** Só dígitos, com DDI. Nulo quando o WhatsApp não revela o número. */
  phone: text("phone"),
  name: text("name"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
  lastMessageText: text("last_message_text").notNull(),
  stage: leadStage("stage").notNull().default("QUALIFICANDO"),
  /** Vendedor que recebeu o lead pelo rodízio. */
  assignedTo: uuid("assigned_to").references(() => users.id, {
    onDelete: "set null",
  }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  qualification: jsonb("qualification").$type<Qualification>(),
  qualificationSummary: text("qualification_summary"),
  createdAt,
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull(),
    type: messageType("type").notNull(),
    text: text("text").notNull(),
    /** Id da mensagem no WhatsApp: impede gravar a mesma mensagem duas vezes. */
    externalId: text("external_id").notNull().unique(),
    /** Colaborador que respondeu pelo portal (nulo se veio do celular). */
    sentBy: uuid("sent_by").references(() => users.id),
    /** Mensagem escrita pela IA de qualificação. */
    sentByBot: boolean("sent_by_bot").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [index("messages_lead_sent_at_idx").on(table.leadId, table.sentAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
