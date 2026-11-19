CREATE TYPE "public"."deletion_reason" AS ENUM('expired', 'user_request', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."file_role" AS ENUM('input', 'output');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "deletion_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"reason" "deletion_reason" NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"role" "file_role" DEFAULT 'input' NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"tool" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_file_ids" uuid[] NOT NULL,
	"output_file_id" uuid,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deletion_log" ADD CONSTRAINT "deletion_log_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_output_file_id_files_id_fk" FOREIGN KEY ("output_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_live_expiry_idx" ON "files" USING btree ("expires_at") WHERE "files"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jobs_expiry_idx" ON "jobs" USING btree ("expires_at");