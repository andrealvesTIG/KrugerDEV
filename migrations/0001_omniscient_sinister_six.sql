CREATE TABLE "api_request_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer,
	"duration" integer,
	"user_id" varchar,
	"organization_id" integer,
	"user_agent" text,
	"ip_address" text,
	"error_message" text,
	"request_body" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" integer NOT NULL,
	"name" varchar,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "application_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_name" text NOT NULL,
	"metric_value" numeric NOT NULL,
	"dimensions" jsonb,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billable_status_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"billable_status" text,
	"comment" text NOT NULL,
	"user_id" varchar,
	"user_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"description" text,
	"is_required" boolean DEFAULT false,
	"options" text[],
	"default_value" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_portfolio_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now(),
	"added_by" varchar
);
--> statement-breakpoint
CREATE TABLE "custom_project_tabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "custom_tab_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"field_key" text NOT NULL,
	"field_type" text NOT NULL,
	"label" text,
	"display_order" integer DEFAULT 0,
	"span" integer DEFAULT 1,
	"is_required" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_tab_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tab_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"columns" integer DEFAULT 2,
	"display_order" integer DEFAULT 0,
	"is_collapsible" boolean DEFAULT true,
	"is_collapsed_by_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_type" text NOT NULL,
	"error_message" text NOT NULL,
	"stack_trace" text,
	"user_id" varchar,
	"organization_id" integer,
	"request_url" text,
	"request_method" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"feature_code" text NOT NULL,
	"organization_id" integer,
	"usage_count" integer DEFAULT 1,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"previous_health" text,
	"new_health" text NOT NULL,
	"comment" text,
	"changed_by" varchar,
	"changed_by_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "help_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"user_email" text NOT NULL,
	"user_name" text,
	"organization_id" integer,
	"organization_name" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"image_urls" text[],
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal',
	"assigned_to" varchar,
	"resolution" text,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "invoice_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"status" text,
	"note" text NOT NULL,
	"user_id" varchar,
	"user_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "risk_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"risk_id" integer NOT NULL,
	"changed_by" varchar,
	"changed_by_name" text,
	"changed_at" timestamp DEFAULT now(),
	"change_type" text NOT NULL,
	"change_summary" text,
	"previous_values" text,
	"new_values" text
);
--> statement-breakpoint
CREATE TABLE "risk_resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"risk_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"probability" text,
	"impact" text,
	"status" text DEFAULT 'Open',
	"mitigation_plan" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false,
	"risk_number" text,
	"category" text,
	"risk_score" integer,
	"response_strategy" text,
	"contingency_plan" text,
	"trigger_events" text,
	"residual_risk" text,
	"owner_id" varchar,
	"reviewer_id" varchar,
	"identified_date" date,
	"target_resolution_date" date,
	"actual_resolution_date" date,
	"impact_cost" numeric,
	"impact_schedule" text,
	"proximity" text,
	"notes" text,
	"item_type" text
);
--> statement-breakpoint
CREATE TABLE "lessons_learned" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'General',
	"type" text DEFAULT 'Improvement',
	"lesson_type" text DEFAULT 'Positive',
	"impact" text,
	"phase" text,
	"root_cause" text,
	"recommendation" text,
	"outcome" text,
	"actions_taken" text,
	"applicability" text,
	"tags" text,
	"attachments" text,
	"is_shared" boolean DEFAULT false,
	"status" text DEFAULT 'Draft',
	"identified_date" date,
	"date_identified" date,
	"identified_by" varchar,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "non_project_time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"resource_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"entry_date" date NOT NULL,
	"hours" numeric NOT NULL,
	"description" text,
	"notes" text,
	"is_billable" boolean DEFAULT false,
	"status" text DEFAULT 'Draft',
	"submitted_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar
);
--> statement-breakpoint
CREATE TABLE "organization_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"options" text[],
	"required" boolean DEFAULT false,
	"description" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organization_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"connection_status" text DEFAULT 'disconnected',
	"additional_data" text,
	"connected_by" text,
	"connected_at" timestamp,
	"updated_at" timestamp DEFAULT now(),
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"tokens_encrypted" text
);
--> statement-breakpoint
CREATE TABLE "portfolio_risk_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"summary" text NOT NULL,
	"report_json" text NOT NULL,
	"share_token" text NOT NULL,
	"generated_by" varchar,
	"generated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_benefits" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"benefit_type" text,
	"measurement_method" text,
	"unit" text,
	"target_value" numeric,
	"actual_value" numeric,
	"baseline_value" numeric,
	"target_date" date,
	"actual_realization_date" date,
	"status" text DEFAULT 'Planned',
	"owner" varchar,
	"notes" text,
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"field_definition_id" integer NOT NULL,
	"value" text,
	"text_value" text,
	"number_value" numeric,
	"date_value" date,
	"boolean_value" boolean,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"decision_type" text,
	"status" text DEFAULT 'Pending',
	"rationale" text,
	"alternatives" text,
	"impact" text,
	"risk_assessment" text,
	"stakeholders" text,
	"decision_date" date,
	"implementation_date" date,
	"review_date" date,
	"outcome" text,
	"decision_maker" varchar,
	"priority" text DEFAULT 'Medium',
	"notes" text,
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer,
	"invoice_number" text,
	"title" text NOT NULL,
	"description" text,
	"amount" numeric DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"status" text DEFAULT 'Draft',
	"invoice_date" date,
	"due_date" date,
	"paid_date" date,
	"vendor_name" text,
	"vendor_email" text,
	"file_name" text,
	"file_url" text,
	"file_size" integer,
	"mime_type" text,
	"source" text,
	"external_id" text,
	"external_url" text,
	"created_by" varchar,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "project_risk_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"summary" text NOT NULL,
	"report_json" text NOT NULL,
	"share_token" text NOT NULL,
	"generated_by" varchar,
	"generated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"criteria_id" integer NOT NULL,
	"score" integer NOT NULL,
	"justification" text,
	"scored_at" timestamp DEFAULT now(),
	"scored_by" varchar
);
--> statement-breakpoint
CREATE TABLE "project_scoring_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"weight" numeric DEFAULT '1',
	"min_score" integer DEFAULT 0,
	"max_score" integer DEFAULT 10,
	"scoring_guidelines" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "project_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_system" boolean DEFAULT false,
	"visible_columns" text[] NOT NULL,
	"column_order" text[],
	"column_widths" jsonb,
	"frozen_columns" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "report_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"dashboards" text[] NOT NULL,
	"frequency" text NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"time_of_day" text DEFAULT '09:00' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"recipients" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp,
	"next_scheduled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resource_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" text NOT NULL,
	"hours_per_day" numeric,
	"notes" text,
	"status" text DEFAULT 'approved',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resource_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"skill_name" text NOT NULL,
	"proficiency_level" text,
	"years_of_experience" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "simulation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"simulation_run_id" integer NOT NULL,
	"step_number" integer NOT NULL,
	"event_date" date NOT NULL,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'medium',
	"source_type" text,
	"source_id" integer,
	"source_name" text,
	"project_id" integer,
	"project_name" text,
	"title" text NOT NULL,
	"description" text,
	"impact_budget" numeric,
	"impact_schedule_days" integer,
	"impact_health" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"portfolio_id" integer,
	"name" text NOT NULL,
	"description" text,
	"time_horizon" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"scenario" text DEFAULT 'baseline',
	"status" text DEFAULT 'pending',
	"current_step" integer DEFAULT 0,
	"total_steps" integer DEFAULT 0,
	"risk_trigger_probability_multiplier" numeric DEFAULT '1.0',
	"budget_variance_range" numeric DEFAULT '0.1',
	"schedule_variance_range" numeric DEFAULT '0.1',
	"snapshot_data" jsonb,
	"final_results" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "simulation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"simulation_run_id" integer NOT NULL,
	"step_number" integer NOT NULL,
	"step_date" date NOT NULL,
	"portfolio_health" text,
	"total_budget" numeric,
	"total_spent" numeric,
	"total_forecast" numeric,
	"projects_on_track" integer,
	"projects_at_risk" integer,
	"projects_off_track" integer,
	"open_risks" integer,
	"triggered_risks" integer,
	"open_issues" integer,
	"completed_tasks" integer,
	"total_tasks" integer,
	"resource_utilization" numeric,
	"project_states" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_project_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"mode" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visible_columns" text[] NOT NULL,
	"column_order" text[],
	"column_widths" jsonb,
	"filter_criteria" jsonb,
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"color" text DEFAULT '#6366f1',
	"is_active" boolean DEFAULT true,
	"is_paid_time" boolean DEFAULT true,
	"requires_approval" boolean DEFAULT true,
	"max_hours_per_year" numeric,
	"is_billable" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "timesheet_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" varchar,
	"closed_at" timestamp,
	"reopened_by" varchar,
	"reopened_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "user_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"consent_type" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"method" text DEFAULT 'checkbox' NOT NULL,
	"revoked" boolean DEFAULT false,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "portfolios" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "target_resolution_date_risk" date;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "actual_resolution_date_risk" date;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "cost_exposure" numeric;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "escalated_to_portfolio" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "escalated_by" varchar;--> statement-breakpoint
ALTER TABLE "mpp_import_tasks" ADD COLUMN "work_hours" numeric;--> statement-breakpoint
ALTER TABLE "mpp_import_tasks" ADD COLUMN "actual_work_hours" numeric;--> statement-breakpoint
ALTER TABLE "mpp_import_tasks" ADD COLUMN "remaining_work_hours" numeric;--> statement-breakpoint
ALTER TABLE "mpp_import_tasks" ADD COLUMN "predecessors" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "organization_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "portfolio_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "task_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "risk_issue_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "milestone_id" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "severity" text DEFAULT 'info';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_url" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dashboard_tab_order" text[];--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dashboard_hidden_tabs" text[];--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_hidden" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "risk_assessment_config" jsonb;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "is_custom" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_total" numeric DEFAULT '0';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "sponsor_resource_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_resource_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "technical_lead_resource_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completion_overridden" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "billable_status" text DEFAULT 'N/A';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "created_by" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "updated_by" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_by" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "timesheet_blocked" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "is_intake_approver" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "timesheet_hidden" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "timesheet_blocked" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completion_overridden" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_source" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pmi_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "linkedin_url" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_technician" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "extra_seat_price_cents" integer;--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billable_status_comments" ADD CONSTRAINT "billable_status_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billable_status_comments" ADD CONSTRAINT "billable_status_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_portfolio_projects" ADD CONSTRAINT "custom_portfolio_projects_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_portfolio_projects" ADD CONSTRAINT "custom_portfolio_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_portfolio_projects" ADD CONSTRAINT "custom_portfolio_projects_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_project_tabs" ADD CONSTRAINT "custom_project_tabs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_project_tabs" ADD CONSTRAINT "custom_project_tabs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tab_fields" ADD CONSTRAINT "custom_tab_fields_section_id_custom_tab_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."custom_tab_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tab_sections" ADD CONSTRAINT "custom_tab_sections_tab_id_custom_project_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."custom_project_tabs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage_logs" ADD CONSTRAINT "feature_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage_logs" ADD CONSTRAINT "feature_usage_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_status_history" ADD CONSTRAINT "health_status_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_status_history" ADD CONSTRAINT "health_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_tickets" ADD CONSTRAINT "help_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_tickets" ADD CONSTRAINT "help_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_tickets" ADD CONSTRAINT "help_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_notes" ADD CONSTRAINT "invoice_notes_invoice_id_project_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."project_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_notes" ADD CONSTRAINT "invoice_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_change_logs" ADD CONSTRAINT "risk_change_logs_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_resource_assignments" ADD CONSTRAINT "risk_resource_assignments_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_resource_assignments" ADD CONSTRAINT "risk_resource_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_identified_by_users_id_fk" FOREIGN KEY ("identified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons_learned" ADD CONSTRAINT "lessons_learned_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_project_time_entries" ADD CONSTRAINT "non_project_time_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_project_time_entries" ADD CONSTRAINT "non_project_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_project_time_entries" ADD CONSTRAINT "non_project_time_entries_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_project_time_entries" ADD CONSTRAINT "non_project_time_entries_category_id_time_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."time_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_project_time_entries" ADD CONSTRAINT "non_project_time_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_project_time_entries" ADD CONSTRAINT "non_project_time_entries_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_custom_fields" ADD CONSTRAINT "organization_custom_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_integrations" ADD CONSTRAINT "organization_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_risk_assessments" ADD CONSTRAINT "portfolio_risk_assessments_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_risk_assessments" ADD CONSTRAINT "portfolio_risk_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_risk_assessments" ADD CONSTRAINT "portfolio_risk_assessments_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_benefits" ADD CONSTRAINT "project_benefits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_benefits" ADD CONSTRAINT "project_benefits_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_benefits" ADD CONSTRAINT "project_benefits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_custom_field_values" ADD CONSTRAINT "project_custom_field_values_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_custom_field_values" ADD CONSTRAINT "project_custom_field_values_field_definition_id_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_decision_maker_users_id_fk" FOREIGN KEY ("decision_maker") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risk_assessments" ADD CONSTRAINT "project_risk_assessments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risk_assessments" ADD CONSTRAINT "project_risk_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risk_assessments" ADD CONSTRAINT "project_risk_assessments_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scores" ADD CONSTRAINT "project_scores_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scores" ADD CONSTRAINT "project_scores_criteria_id_project_scoring_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."project_scoring_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scores" ADD CONSTRAINT "project_scores_scored_by_users_id_fk" FOREIGN KEY ("scored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scoring_criteria" ADD CONSTRAINT "project_scoring_criteria_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scoring_criteria" ADD CONSTRAINT "project_scoring_criteria_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_views" ADD CONSTRAINT "project_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_views" ADD CONSTRAINT "project_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_availability" ADD CONSTRAINT "resource_availability_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_availability" ADD CONSTRAINT "resource_availability_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_availability" ADD CONSTRAINT "resource_availability_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_skills" ADD CONSTRAINT "resource_skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_skills" ADD CONSTRAINT "resource_skills_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_simulation_run_id_simulation_runs_id_fk" FOREIGN KEY ("simulation_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_snapshots" ADD CONSTRAINT "simulation_snapshots_simulation_run_id_simulation_runs_id_fk" FOREIGN KEY ("simulation_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_project_views" ADD CONSTRAINT "system_project_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_project_views" ADD CONSTRAINT "system_project_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_project_views" ADD CONSTRAINT "system_project_views_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_categories" ADD CONSTRAINT "time_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_token_idx" ON "api_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "api_tokens_user_org_idx" ON "api_tokens" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_portfolio_projects_unique" ON "custom_portfolio_projects" USING btree ("portfolio_id","project_id");--> statement-breakpoint
ALTER TABLE "external_shares" ADD CONSTRAINT "external_shares_shared_with_resource_id_resources_id_fk" FOREIGN KEY ("shared_with_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_escalated_by_users_id_fk" FOREIGN KEY ("escalated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_project_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."project_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_resource_id_resources_id_fk" FOREIGN KEY ("manager_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_sponsor_resource_id_resources_id_fk" FOREIGN KEY ("sponsor_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_resource_id_resources_id_fk" FOREIGN KEY ("owner_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_technical_lead_resource_id_resources_id_fk" FOREIGN KEY ("technical_lead_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_change_logs_issue_id_idx" ON "issue_change_logs" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "ira_issue_id_idx" ON "issue_resource_assignments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "ira_resource_id_idx" ON "issue_resource_assignments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "issues_project_id_idx" ON "issues" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issues_item_type_idx" ON "issues" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "issues_project_item_type_idx" ON "issues" USING btree ("project_id","item_type");--> statement-breakpoint
CREATE INDEX "milestones_project_id_idx" ON "milestones" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_access_request" ON "organization_access_requests" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_pending_invite" ON "organization_invites" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_org_user" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "project_change_logs_project_id_idx" ON "project_change_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_change_logs_task_id_idx" ON "task_change_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_task_id_idx" ON "task_dependencies" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_depends_on_idx" ON "task_dependencies" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "tra_task_id_idx" ON "task_resource_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tra_resource_id_idx" ON "task_resource_assignments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_id_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_deleted_at_idx" ON "tasks" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_start_date_idx" ON "tasks" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "tasks_end_date_idx" ON "tasks" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_project_deleted_task_idx" ON "tasks" USING btree ("project_id","deleted_at","task_index");--> statement-breakpoint
CREATE INDEX "te_task_id_idx" ON "timesheet_entries" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "te_resource_id_idx" ON "timesheet_entries" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "te_project_id_idx" ON "timesheet_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "te_organization_id_idx" ON "timesheet_entries" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");