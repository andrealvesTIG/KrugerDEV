CREATE TABLE "change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"request_number" text,
	"title" text NOT NULL,
	"description" text,
	"justification" text,
	"type" text DEFAULT 'Scope',
	"priority" text DEFAULT 'Medium',
	"status" text DEFAULT 'Draft',
	"impact" text,
	"requested_by" text,
	"requested_date" date,
	"reviewed_by" text,
	"reviewed_date" date,
	"implemented_date" date,
	"estimated_cost" numeric,
	"estimated_effort" text,
	"affected_areas" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"wbs" text,
	"comments" text,
	"category" text,
	"fiscal_year" integer NOT NULL,
	"aop_total" numeric DEFAULT '0',
	"fcst_total" numeric DEFAULT '0',
	"act_total" numeric DEFAULT '0',
	"fcst_m1" numeric DEFAULT '0',
	"fcst_m2" numeric DEFAULT '0',
	"fcst_m3" numeric DEFAULT '0',
	"fcst_m4" numeric DEFAULT '0',
	"fcst_m5" numeric DEFAULT '0',
	"fcst_m6" numeric DEFAULT '0',
	"fcst_m7" numeric DEFAULT '0',
	"fcst_m8" numeric DEFAULT '0',
	"fcst_m9" numeric DEFAULT '0',
	"fcst_m10" numeric DEFAULT '0',
	"fcst_m11" numeric DEFAULT '0',
	"fcst_m12" numeric DEFAULT '0',
	"act_m1" numeric DEFAULT '0',
	"act_m2" numeric DEFAULT '0',
	"act_m3" numeric DEFAULT '0',
	"act_m4" numeric DEFAULT '0',
	"act_m5" numeric DEFAULT '0',
	"act_m6" numeric DEFAULT '0',
	"act_m7" numeric DEFAULT '0',
	"act_m8" numeric DEFAULT '0',
	"act_m9" numeric DEFAULT '0',
	"act_m10" numeric DEFAULT '0',
	"act_m11" numeric DEFAULT '0',
	"act_m12" numeric DEFAULT '0',
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "custom_dashboards" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_type" text NOT NULL,
	"object_id" integer NOT NULL,
	"source_organization_id" integer NOT NULL,
	"shared_with_user_id" varchar NOT NULL,
	"shared_with_resource_id" integer,
	"access_role" text DEFAULT 'viewer' NOT NULL,
	"shared_by" varchar,
	"shared_at" timestamp DEFAULT now(),
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "intake_workflow_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"step_key" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"help_text" text,
	"required_fields" text[],
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issue_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"changed_by" varchar,
	"changed_by_name" text,
	"changed_at" timestamp DEFAULT now(),
	"change_type" text NOT NULL,
	"change_summary" text,
	"previous_values" text,
	"new_values" text
);
--> statement-breakpoint
CREATE TABLE "issue_resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"item_type" text DEFAULT 'issue' NOT NULL,
	"issue_number" text,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"priority" text DEFAULT 'Medium',
	"severity" text,
	"status" text DEFAULT 'Open',
	"type" text DEFAULT 'Bug',
	"escalation_level" text,
	"assignee" text,
	"assignee_id" varchar,
	"reporter_id" varchar,
	"reported_by" text,
	"reported_date" date,
	"target_resolution_date" date,
	"actual_resolution_date" date,
	"resolution" text,
	"root_cause" text,
	"impact_description" text,
	"impact_cost" numeric,
	"impact_schedule" text,
	"related_task_id" integer,
	"steps_to_reproduce" text,
	"environment" text,
	"labels" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false,
	"probability" text,
	"impact" text,
	"risk_score" integer,
	"response_strategy" text,
	"mitigation_plan" text,
	"contingency_plan" text,
	"trigger_events" text,
	"residual_risk" text,
	"owner_id" varchar,
	"reviewer_id" varchar,
	"identified_date" date,
	"proximity" text
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"milestone_number" text,
	"title" text NOT NULL,
	"description" text,
	"milestone_type" text,
	"due_date" date NOT NULL,
	"baseline_due_date" date,
	"actual_completion_date" date,
	"start_date" date,
	"completed" boolean DEFAULT false,
	"status" text DEFAULT 'Backlog',
	"priority" text DEFAULT 'Medium',
	"owner_id" varchar,
	"assignee" text,
	"deliverables" text,
	"acceptance_criteria" text,
	"dependencies" text,
	"success_metrics" text,
	"stakeholders" text,
	"phase" text,
	"notes" text,
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "mpp_import_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"task_id" integer,
	"wbs" text,
	"task_name" text NOT NULL,
	"start_date" date,
	"finish_date" date,
	"duration" text,
	"duration_days" integer,
	"percent_complete" integer DEFAULT 0,
	"outline_level" integer DEFAULT 1,
	"parent_task_id" integer,
	"is_summary" boolean DEFAULT false,
	"is_milestone" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mpp_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"file_name" text NOT NULL,
	"file_type" text DEFAULT 'xml' NOT NULL,
	"file_url" text,
	"imported_by" varchar,
	"last_synced_at" timestamp DEFAULT now(),
	"task_count" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"project_id" integer,
	"comment_id" integer,
	"from_user_id" varchar,
	"from_user_name" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organization_access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_role" text DEFAULT 'org_admin' NOT NULL,
	"message" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo_url" text,
	"owner_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"hidden_modules" text[],
	"module_order" text[],
	"hidden_groups" text[],
	"sidebar_structure" jsonb,
	"deactivated_at" timestamp,
	"deactivated_by" varchar,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"organization_id" integer,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"strategy" text,
	"manager_id" varchar,
	"business_owner_id" varchar,
	"strategic_objective" text,
	"budget_allocated" numeric,
	"budget_spent" numeric,
	"target_start_date" date,
	"target_end_date" date,
	"risk_tolerance" text,
	"performance_metrics" text,
	"status" text DEFAULT 'Active',
	"health_score" text DEFAULT 'Green',
	"department" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"team_member_resource_ids" integer[],
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "project_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"changed_by" varchar,
	"changed_by_name" text,
	"changed_at" timestamp DEFAULT now(),
	"change_type" text NOT NULL,
	"change_summary" text,
	"previous_values" text,
	"new_values" text
);
--> statement-breakpoint
CREATE TABLE "project_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"content" text NOT NULL,
	"author_id" varchar,
	"author_name" text,
	"mentions" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'General',
	"category" text,
	"version" text DEFAULT '1.0',
	"status" text DEFAULT 'Draft',
	"file_name" text,
	"file_url" text,
	"file_size" integer,
	"mime_type" text,
	"content" text,
	"author" text,
	"owner" text,
	"reviewed_by" text,
	"reviewed_date" date,
	"approved_by" text,
	"approved_date" date,
	"expires_at" date,
	"tags" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "project_financials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"category" text NOT NULL,
	"line_item" text NOT NULL,
	"description" text,
	"fiscal_year" integer NOT NULL,
	"fiscal_period" text,
	"budget_amount" numeric DEFAULT '0',
	"planned_amount" numeric DEFAULT '0',
	"actual_amount" numeric DEFAULT '0',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "project_intakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"intake_number" text,
	"project_name" text NOT NULL,
	"submitter_id" varchar,
	"description" text,
	"funding_source" text,
	"portfolio_id" integer,
	"business_unit" text,
	"program_id" integer,
	"program_name" text,
	"current_step" text DEFAULT 'is_backlog',
	"status" text DEFAULT 'draft',
	"is_backlog_complete" boolean DEFAULT false,
	"basic_info_complete" boolean DEFAULT false,
	"financials_complete" boolean DEFAULT false,
	"project_cost_complete" boolean DEFAULT false,
	"cyber_arch_complete" boolean DEFAULT false,
	"pmo_submitted" boolean DEFAULT false,
	"pmo_approved" boolean DEFAULT false,
	"pmo_approved_at" timestamp,
	"pmo_approved_by" varchar,
	"estimated_budget" numeric DEFAULT '0',
	"capital_expense" numeric DEFAULT '0',
	"operating_expense" numeric DEFAULT '0',
	"financial_justification" text,
	"cyber_risk_assessment" text,
	"architectural_review" text,
	"compliance_requirements" text,
	"security_approval" boolean,
	"security_approval_date" timestamp,
	"security_approver_id" varchar,
	"it_cost_estimate" numeric DEFAULT '0',
	"resource_requirements" text,
	"implementation_timeline" text,
	"cost_benefit_analysis" text,
	"approved_at" timestamp,
	"approved_by" varchar,
	"rejected_at" timestamp,
	"rejected_by" varchar,
	"rejection_reason" text,
	"created_project_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"portfolio_id" integer,
	"name" text NOT NULL,
	"project_code" text,
	"description" text,
	"status" text DEFAULT 'Initiation' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"project_type" text,
	"methodology" text,
	"start_date" date,
	"end_date" date,
	"baseline_start_date" date,
	"baseline_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"budget" numeric DEFAULT '0' NOT NULL,
	"actual_cost" numeric DEFAULT '0',
	"forecast_cost" numeric,
	"manager_id" varchar,
	"manager_resource_id" integer,
	"business_sponsor_id" varchar,
	"business_owner_id" varchar,
	"technical_lead_id" varchar,
	"completion_percentage" integer DEFAULT 0,
	"health" text DEFAULT 'Green',
	"health_reason" text,
	"health_reason_updated_at" timestamp,
	"schedule_variance" integer,
	"cost_variance" numeric,
	"scope" text,
	"objectives" text,
	"success_criteria" text,
	"constraints" text,
	"assumptions" text,
	"dependencies" text,
	"department" text,
	"category" text,
	"business_value" text,
	"risk_level" text,
	"source" text DEFAULT 'manual',
	"planner_plan_id" text,
	"dataverse_org_id" text,
	"dataverse_tenant_id" text,
	"source_file_name" text,
	"source_file_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar,
	"resource_code" text,
	"resource_type" text,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"title" text,
	"department" text,
	"cost_center" text,
	"location" text,
	"timezone" text,
	"manager_id" varchar,
	"skills" text,
	"certifications" text,
	"experience_level" text,
	"hourly_rate" numeric,
	"overtime_rate" numeric,
	"cost_rate" numeric,
	"weekly_capacity" numeric DEFAULT '40',
	"availability" integer DEFAULT 100,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true,
	"is_approver" boolean DEFAULT false,
	"is_billable" boolean DEFAULT true,
	"photo_url" text,
	"notes" text,
	"invited_project_ids" integer[],
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "status_report_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer,
	"report_date" date NOT NULL,
	"week_number" integer,
	"year_number" integer,
	"executive_summary" text,
	"report_type" text DEFAULT 'weekly',
	"recipient_email" text,
	"sent_at" timestamp,
	"pdf_file_url" text,
	"pdf_file_name" text,
	"project_health" text,
	"project_status" text,
	"completion_percentage" integer,
	"total_budget" numeric,
	"actual_spent" numeric,
	"forecast_amount" numeric,
	"open_risks_count" integer,
	"open_issues_count" integer,
	"completed_milestones_count" integer,
	"total_milestones_count" integer,
	"created_by" varchar,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now(),
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "task_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"changed_by" varchar,
	"changed_by_name" text,
	"changed_at" timestamp DEFAULT now(),
	"change_type" text NOT NULL,
	"change_summary" text,
	"previous_values" text,
	"new_values" text
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"depends_on_task_id" integer NOT NULL,
	"dependency_type" text DEFAULT 'finish-to-start',
	"lag_days" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"allocation_percentage" integer DEFAULT 100,
	"role" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"task_index" integer,
	"task_number" text,
	"wbs" text,
	"name" text NOT NULL,
	"description" text,
	"task_type" text,
	"priority" text DEFAULT 'Medium',
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"baseline_start_date" date,
	"baseline_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"duration_days" integer,
	"estimated_hours" numeric,
	"actual_hours" numeric,
	"remaining_hours" numeric,
	"progress" integer DEFAULT 0,
	"status" text DEFAULT 'Not Started',
	"constraint_type" text,
	"constraint_date" date,
	"assignee" text,
	"owner_id" varchar,
	"outline_level" integer,
	"parent_id" integer,
	"is_milestone" boolean DEFAULT false,
	"is_summary" boolean DEFAULT false,
	"is_critical" boolean DEFAULT false,
	"cost" numeric,
	"actual_cost" numeric,
	"phase" text,
	"category" text,
	"labels" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"deleted_by" varchar,
	"is_demo" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"resource_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"entry_date" date NOT NULL,
	"hours" numeric NOT NULL,
	"notes" text,
	"status" text DEFAULT 'Draft',
	"submitted_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"token" varchar NOT NULL,
	"type" varchar DEFAULT 'signup',
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"password_hash" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'user',
	"username" varchar,
	"avatar_url" varchar,
	"onboarding_completed" boolean DEFAULT false,
	"detected_company" varchar,
	"detected_industry" varchar,
	"microsoft_id" varchar,
	"microsoft_tenant_id" varchar,
	"api_key" varchar,
	"deactivated_at" timestamp,
	"deactivated_by" varchar,
	"email_verified" boolean DEFAULT false,
	"email_verification_token" varchar,
	"email_verification_expiry" timestamp,
	"terms_accepted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_microsoft_id_unique" UNIQUE("microsoft_id"),
	CONSTRAINT "users_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" varchar,
	"org_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer,
	"user_id" varchar,
	"org_id" integer,
	"provider" text DEFAULT 'paypal' NOT NULL,
	"external_transaction_id" text,
	"external_invoice_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"description" text,
	"plan_name" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"payment_method_type" text,
	"payment_method_last4" text,
	"receipt_url" text,
	"failure_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "features_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invoice_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"billing_cycle_id" integer,
	"provider_invoice_id" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"hosted_invoice_url" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit_label" text NOT NULL,
	"aggregation_type" text DEFAULT 'COUNT' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "meters_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"limits_json" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plan_meter_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"meter_id" integer NOT NULL,
	"rule_type" text NOT NULL,
	"included_units_annual" integer,
	"hard_cap_units" integer,
	"overage_unit_price_microcents" integer,
	"is_shared_pool" boolean DEFAULT false,
	"stripe_meter_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"annual_price_cents" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"stripe_price_id" text,
	"stripe_product_id" text,
	"paypal_plan_id" text,
	"paypal_product_id" text,
	"max_seats" integer,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"code" text NOT NULL,
	"commission_percent" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true,
	"total_referrals" integer DEFAULT 0,
	"total_earnings_cents" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referral_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"paypal_email" text,
	"paypal_transaction_id" text,
	"processed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referral_code_id" integer NOT NULL,
	"referrer_id" varchar NOT NULL,
	"referred_user_id" varchar,
	"referred_email" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"signed_up_at" timestamp,
	"converted_at" timestamp,
	"conversion_amount_cents" integer,
	"commission_amount_cents" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resource_credit_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_type" text NOT NULL,
	"credit_cost" integer DEFAULT 100 NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar,
	CONSTRAINT "resource_credit_costs_resource_type_unique" UNIQUE("resource_type")
);
--> statement-breakpoint
CREATE TABLE "seat_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"subject_type" text NOT NULL,
	"user_id" varchar,
	"org_id" integer,
	"hard_cap_enabled" boolean DEFAULT false,
	"bonus_seats" integer DEFAULT 0,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"paypal_subscription_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"billing_cycle_id" integer NOT NULL,
	"meter_id" integer NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"actor_user_id" varchar,
	"org_id" integer,
	"request_id" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "usage_events_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "usage_rollups" (
	"id" serial PRIMARY KEY NOT NULL,
	"billing_cycle_id" integer NOT NULL,
	"meter_id" integer NOT NULL,
	"included_units" integer DEFAULT 0 NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	"remaining_units" integer DEFAULT 0 NOT NULL,
	"overage_units" integer DEFAULT 0 NOT NULL,
	"overage_cost_microcents" integer DEFAULT 0 NOT NULL,
	"hard_cap_hit" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_dashboards" ADD CONSTRAINT "custom_dashboards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_dashboards" ADD CONSTRAINT "custom_dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_shares" ADD CONSTRAINT "external_shares_source_organization_id_organizations_id_fk" FOREIGN KEY ("source_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_shares" ADD CONSTRAINT "external_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_shares" ADD CONSTRAINT "external_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_workflow_steps" ADD CONSTRAINT "intake_workflow_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_change_logs" ADD CONSTRAINT "issue_change_logs_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_change_logs" ADD CONSTRAINT "issue_change_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_resource_assignments" ADD CONSTRAINT "issue_resource_assignments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_resource_assignments" ADD CONSTRAINT "issue_resource_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_related_task_id_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpp_import_tasks" ADD CONSTRAINT "mpp_import_tasks_import_id_mpp_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."mpp_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpp_imports" ADD CONSTRAINT "mpp_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpp_imports" ADD CONSTRAINT "mpp_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpp_imports" ADD CONSTRAINT "mpp_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_access_requests" ADD CONSTRAINT "organization_access_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_access_requests" ADD CONSTRAINT "organization_access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_access_requests" ADD CONSTRAINT "organization_access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_deactivated_by_users_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_business_owner_id_users_id_fk" FOREIGN KEY ("business_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_logs" ADD CONSTRAINT "project_change_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_logs" ADD CONSTRAINT "project_change_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_financials" ADD CONSTRAINT "project_financials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_pmo_approved_by_users_id_fk" FOREIGN KEY ("pmo_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_security_approver_id_users_id_fk" FOREIGN KEY ("security_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_created_project_id_projects_id_fk" FOREIGN KEY ("created_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_sponsor_id_users_id_fk" FOREIGN KEY ("business_sponsor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_owner_id_users_id_fk" FOREIGN KEY ("business_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_technical_lead_id_users_id_fk" FOREIGN KEY ("technical_lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_report_history" ADD CONSTRAINT "status_report_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_report_history" ADD CONSTRAINT "status_report_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_report_history" ADD CONSTRAINT "status_report_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_change_logs" ADD CONSTRAINT "task_change_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_change_logs" ADD CONSTRAINT "task_change_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resource_assignments" ADD CONSTRAINT "task_resource_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resource_assignments" ADD CONSTRAINT "task_resource_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_logs" ADD CONSTRAINT "billing_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_meter_rules" ADD CONSTRAINT "plan_meter_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_meter_rules" ADD CONSTRAINT "plan_meter_rules_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_credit_costs" ADD CONSTRAINT "resource_credit_costs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_billing_audit_logs_actor" ON "billing_audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_billing_audit_logs_entity" ON "billing_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_billing_cycles_subscription_id" ON "billing_cycles" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_billing_transactions_user_id" ON "billing_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_billing_transactions_org_id" ON "billing_transactions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_billing_transactions_subscription_id" ON "billing_transactions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_billing_transactions_created_at" ON "billing_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payment_events_provider_id" ON "payment_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "idx_referral_codes_user_id" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referral_codes_code" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_referral_payouts_user_id" ON "referral_payouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer_id" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_referred_user_id" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_code_id" ON "referrals" USING btree ("referral_code_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_org_id" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_usage_events_billing_cycle" ON "usage_events" USING btree ("billing_cycle_id");--> statement-breakpoint
CREATE INDEX "idx_usage_events_meter" ON "usage_events" USING btree ("meter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_events_request_id" ON "usage_events" USING btree ("request_id");