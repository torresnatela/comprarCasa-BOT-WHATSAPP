import {
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { DEAL_TYPES, LEAD_STAGES, LOST_REASONS } from "../../lib/funnel";
import { USER_ROLES, USER_STATUSES } from "../../lib/roles";

export { DEAL_TYPES, LEAD_STAGES, LOST_REASONS, USER_ROLES, USER_STATUSES };
export type { DealType, LeadStage, LostReason } from "../../lib/funnel";
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

export const messageDirection = pgEnum("message_direction", MESSAGE_DIRECTIONS);
export const messageType = pgEnum("message_type", MESSAGE_TYPES);
export const leadStage = pgEnum("lead_stage", LEAD_STAGES);
export const dealType = pgEnum("deal_type", DEAL_TYPES);
export const lostReason = pgEnum("lost_reason", LOST_REASONS);

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
  /** Etapa do funil. A IA só atua em QUALIFICACAO (veja `isAutomationActive`). */
  stage: leadStage("stage").notNull().default("QUALIFICACAO"),
  /** Pausa manual da IA para este contato. */
  automationPaused: boolean("automation_paused").notNull().default(false),
  stageChangedAt: timestamp("stage_changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Preenchidos só quando a etapa é GANHO. */
  wonType: dealType("won_type"),
  wonValue: numeric("won_value", { precision: 14, scale: 2 }),
  wonConditions: text("won_conditions"),
  /** Preenchidos só quando a etapa é PERDIDO. */
  lostReason: lostReason("lost_reason"),
  lostNote: text("lost_note"),
  createdAt,
});

/** Tarefa (lembrete com data) ligada a um contato. */
export const leadTasks = pgTable(
  "lead_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Dia de vencimento, sem horário (AAAA-MM-DD). */
    dueDate: date("due_date").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt,
  },
  (table) => [index("lead_tasks_lead_idx").on(table.leadId)],
);

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
export type LeadTask = typeof leadTasks.$inferSelect;
export type NewLeadTask = typeof leadTasks.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
