CREATE TYPE "public"."message_access" AS ENUM('TODAS', 'PROPRIAS', 'NENHUMA');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "message_access" "message_access" DEFAULT 'PROPRIAS' NOT NULL;