ALTER TABLE "lessons_learned" ALTER COLUMN "approved_by" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "mpp_import_tasks" ALTER COLUMN "duration_days" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "project_template_items" ALTER COLUMN "duration_days" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "end_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "duration_days" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_internal" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "is_ongoing" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" DROP COLUMN "identified_date";