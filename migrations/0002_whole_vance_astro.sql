CREATE TABLE "approval_delegations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"delegator_id" varchar NOT NULL,
	"delegate_id" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_template_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"task_id" integer,
	"wbs" text,
	"name" text NOT NULL,
	"description" text,
	"start_date" date,
	"end_date" date,
	"duration" text,
	"duration_days" integer,
	"outline_level" integer DEFAULT 1,
	"parent_task_id" integer,
	"is_summary" boolean DEFAULT false,
	"is_milestone" boolean DEFAULT false,
	"predecessors" text,
	"notes" text,
	"work_hours" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text DEFAULT 'project' NOT NULL,
	"original_file_name" text,
	"stored_file_url" text,
	"item_count" integer DEFAULT 0,
	"milestone_count" integer DEFAULT 0,
	"created_by" varchar,
	"source_project_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rejection_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"category" text DEFAULT 'General',
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"entry_id" integer,
	"action" text NOT NULL,
	"actor_id" varchar NOT NULL,
	"target_user_id" varchar,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text NOT NULL,
	"comment_type" text DEFAULT 'comment',
	"status_from" text,
	"status_to" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_escalation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"entry_user_id" varchar NOT NULL,
	"manager_id" varchar,
	"escalated_to_id" varchar,
	"week_start" date NOT NULL,
	"reason" text,
	"email_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_reminder_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"reminder_type" text NOT NULL,
	"week_start" date NOT NULL,
	"urgency_level" text DEFAULT 'friendly',
	"email_sent" boolean DEFAULT false,
	"notification_created" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_reminder_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"enabled" boolean DEFAULT true,
	"email_enabled" boolean DEFAULT true,
	"notification_enabled" boolean DEFAULT true,
	"submission_reminder_days" jsonb DEFAULT '[4,5,8]'::jsonb,
	"approval_reminder_days" integer DEFAULT 2,
	"escalation_threshold_days" integer DEFAULT 5,
	"frequency_cap" integer DEFAULT 3,
	"digest_enabled" boolean DEFAULT true,
	"digest_day" integer DEFAULT 1,
	"scheduled_hour" integer DEFAULT 9,
	"scheduled_minute" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_reminder_snooze" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"week_start" date NOT NULL,
	"snoozed_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"min_weekly_hours" numeric DEFAULT '0',
	"max_weekly_hours" numeric DEFAULT '50',
	"overtime_threshold" numeric DEFAULT '40',
	"grace_period_days" integer DEFAULT 0,
	"mandatory_notes" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"lesson_key" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"video_title" text NOT NULL,
	"video_description" text NOT NULL,
	"key_concepts" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_key" varchar NOT NULL,
	"name" text NOT NULL,
	"subtitle" text NOT NULL,
	"cert_prefix" varchar(10) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "training_modules_module_key_unique" UNIQUE("module_key")
);
--> statement-breakpoint
CREATE TABLE "training_quiz_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"question_key" varchar NOT NULL,
	"scenario" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "uncon_selfie_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"interviewer" varchar(255),
	"photo_path" text,
	"share_token" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "scheduling_defaults" jsonb;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD COLUMN "rejected_by" varchar;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD COLUMN "proxy_user_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_profile_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegator_id_users_id_fk" FOREIGN KEY ("delegator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegate_id_users_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_items" ADD CONSTRAINT "project_template_items_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_source_project_id_projects_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejection_templates" ADD CONSTRAINT "rejection_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_audit_log" ADD CONSTRAINT "timesheet_audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_audit_log" ADD CONSTRAINT "timesheet_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_audit_log" ADD CONSTRAINT "timesheet_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_comments" ADD CONSTRAINT "timesheet_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_comments" ADD CONSTRAINT "timesheet_comments_entry_id_timesheet_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."timesheet_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_comments" ADD CONSTRAINT "timesheet_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_escalation_log" ADD CONSTRAINT "timesheet_escalation_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_escalation_log" ADD CONSTRAINT "timesheet_escalation_log_entry_user_id_users_id_fk" FOREIGN KEY ("entry_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_escalation_log" ADD CONSTRAINT "timesheet_escalation_log_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_escalation_log" ADD CONSTRAINT "timesheet_escalation_log_escalated_to_id_users_id_fk" FOREIGN KEY ("escalated_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_reminder_log" ADD CONSTRAINT "timesheet_reminder_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_reminder_log" ADD CONSTRAINT "timesheet_reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_reminder_settings" ADD CONSTRAINT "timesheet_reminder_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_reminder_snooze" ADD CONSTRAINT "timesheet_reminder_snooze_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_reminder_snooze" ADD CONSTRAINT "timesheet_reminder_snooze_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_settings" ADD CONSTRAINT "timesheet_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_quiz_questions" ADD CONSTRAINT "training_quiz_questions_lesson_id_training_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."training_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_org_idx" ON "approval_delegations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ad_delegator_idx" ON "approval_delegations" USING btree ("delegator_id");--> statement-breakpoint
CREATE INDEX "ad_delegate_idx" ON "approval_delegations" USING btree ("delegate_id");--> statement-breakpoint
CREATE INDEX "project_template_items_template_idx" ON "project_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "project_templates_org_idx" ON "project_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rt_org_idx" ON "rejection_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ts_audit_entry_idx" ON "timesheet_audit_log" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "ts_audit_org_idx" ON "timesheet_audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ts_audit_actor_idx" ON "timesheet_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "ts_audit_created_idx" ON "timesheet_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tc_entry_idx" ON "timesheet_comments" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "tc_org_idx" ON "timesheet_comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tel_org_idx" ON "timesheet_escalation_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tel_user_week_idx" ON "timesheet_escalation_log" USING btree ("entry_user_id","week_start");--> statement-breakpoint
CREATE INDEX "trl_org_idx" ON "timesheet_reminder_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "trl_user_week_idx" ON "timesheet_reminder_log" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "trs_org_idx" ON "timesheet_reminder_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "trsnz_user_week_idx" ON "timesheet_reminder_snooze" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "ts_settings_org_idx" ON "timesheet_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "training_lessons_module_idx" ON "training_lessons" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_lessons_module_key_idx" ON "training_lessons" USING btree ("module_id","lesson_key");--> statement-breakpoint
CREATE INDEX "training_questions_lesson_idx" ON "training_quiz_questions" USING btree ("lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_questions_lesson_key_idx" ON "training_quiz_questions" USING btree ("lesson_id","question_key");--> statement-breakpoint
CREATE INDEX "uncon_selfie_leads_email_idx" ON "uncon_selfie_leads" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uncon_selfie_leads_share_token_idx" ON "uncon_selfie_leads" USING btree ("share_token");--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_proxy_user_id_users_id_fk" FOREIGN KEY ("proxy_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_org_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_portfolio_id_idx" ON "projects" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "projects_org_portfolio_deleted_idx" ON "projects" USING btree ("organization_id","portfolio_id","deleted_at");--> statement-breakpoint
CREATE INDEX "projects_manager_id_idx" ON "projects" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "projects_deleted_at_idx" ON "projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "resources_org_id_idx" ON "resources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "resources_user_id_idx" ON "resources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resources_org_user_idx" ON "resources" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "te_user_org_date_idx" ON "timesheet_entries" USING btree ("user_id","organization_id","entry_date");--> statement-breakpoint
CREATE INDEX "te_resource_task_date_idx" ON "timesheet_entries" USING btree ("resource_id","task_id","entry_date");