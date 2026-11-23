CREATE TYPE "public"."lead_stage" AS ENUM('QUALIFICANDO', 'AGUARDANDO_VENDEDOR', 'DISTRIBUIDO', 'HUMANO');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "stage" "lead_stage" DEFAULT 'QUALIFICANDO' NOT NULL;--> statement-breakpoint
-- Leads anteriores à qualificação por IA já estão com a equipe: o bot não deve puxar conversa com eles.
UPDATE "leads" SET "stage" = 'HUMANO';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qualification" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qualification_summary" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_by_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "in_rotation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;