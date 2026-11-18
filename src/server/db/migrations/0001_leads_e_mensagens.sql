CREATE TYPE "public"."message_direction" AS ENUM('RECEBIDA', 'ENVIADA');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXTO', 'OUTRO');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_jid" text NOT NULL,
	"phone" text,
	"name" text,
	"last_message_at" timestamp with time zone NOT NULL,
	"last_message_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_whatsapp_jid_unique" UNIQUE("whatsapp_jid")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"type" "message_type" NOT NULL,
	"text" text NOT NULL,
	"external_id" text NOT NULL,
	"sent_by" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_lead_sent_at_idx" ON "messages" USING btree ("lead_id","sent_at");