ALTER TABLE "conventions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted" = true;--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";--> statement-breakpoint
CREATE INDEX "conventions_repo_created_idx" ON "conventions" USING btree ("repo_id","created_at");