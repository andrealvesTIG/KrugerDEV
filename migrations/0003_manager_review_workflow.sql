CREATE TABLE IF NOT EXISTS "approval_delegations" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "delegator_id" varchar NOT NULL,
  "delegate_id" varchar NOT NULL,
  "start_date" varchar NOT NULL,
  "end_date" varchar NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rejection_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "name" varchar NOT NULL,
  "text" text NOT NULL,
  "category" varchar,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "timesheet_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "entry_id" integer NOT NULL,
  "organization_id" integer NOT NULL,
  "user_id" varchar NOT NULL,
  "text" text NOT NULL,
  "comment_type" varchar DEFAULT 'comment' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
