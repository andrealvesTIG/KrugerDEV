CREATE TABLE IF NOT EXISTS "approval_delegations" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "delegator_id" varchar NOT NULL REFERENCES "users"("id"),
  "delegate_id" varchar NOT NULL REFERENCES "users"("id"),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "revoked_at" timestamp
);

CREATE INDEX IF NOT EXISTS "ad_org_idx" ON "approval_delegations" ("organization_id");
CREATE INDEX IF NOT EXISTS "ad_delegator_idx" ON "approval_delegations" ("delegator_id");
CREATE INDEX IF NOT EXISTS "ad_delegate_idx" ON "approval_delegations" ("delegate_id");

CREATE TABLE IF NOT EXISTS "rejection_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "text" text NOT NULL,
  "category" text DEFAULT 'General',
  "is_active" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rt_org_idx" ON "rejection_templates" ("organization_id");

CREATE TABLE IF NOT EXISTS "timesheet_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "entry_id" integer NOT NULL REFERENCES "timesheet_entries"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "text" text NOT NULL,
  "comment_type" text DEFAULT 'comment',
  "status_from" text,
  "status_to" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tc_entry_idx" ON "timesheet_comments" ("entry_id");
CREATE INDEX IF NOT EXISTS "tc_org_idx" ON "timesheet_comments" ("organization_id");

ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp;
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "rejected_by" varchar REFERENCES "users"("id");
