CREATE TYPE "public"."deal_type" AS ENUM('COMPRA', 'ALUGUEL');--> statement-breakpoint
CREATE TYPE "public"."lost_reason" AS ENUM('PRECO', 'COMPROU_OUTRO', 'DESISTIU', 'SEM_RESPOSTA', 'SEM_CREDITO', 'OUTRO');--> statement-breakpoint
ALTER TYPE "public"."lead_stage" ADD VALUE 'PARADO';--> statement-breakpoint
ALTER TYPE "public"."lead_stage" ADD VALUE 'GANHO';--> statement-breakpoint
ALTER TYPE "public"."lead_stage" ADD VALUE 'PERDIDO';--> statement-breakpoint
CREATE TABLE "lead_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"done_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "automation_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "won_type" "deal_type";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "won_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "won_conditions" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason" "lost_reason";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_note" text;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_tasks_lead_idx" ON "lead_tasks" USING btree ("lead_id");