-- Timesheet Settings (org-level policies)
CREATE TABLE IF NOT EXISTS "timesheet_settings" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "min_weekly_hours" numeric DEFAULT '0',
  "max_weekly_hours" numeric DEFAULT '50',
  "overtime_threshold" numeric DEFAULT '40',
  "grace_period_days" integer DEFAULT 0,
  "mandatory_notes" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ts_settings_org_idx" ON "timesheet_settings" ("organization_id");

-- Timesheet Audit Log
CREATE TABLE IF NOT EXISTS "timesheet_audit_log" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "entry_id" integer,
  "action" text NOT NULL,
  "actor_id" varchar NOT NULL REFERENCES "users"("id"),
  "target_user_id" varchar REFERENCES "users"("id"),
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ts_audit_entry_idx" ON "timesheet_audit_log" ("entry_id");
CREATE INDEX IF NOT EXISTS "ts_audit_org_idx" ON "timesheet_audit_log" ("organization_id");
CREATE INDEX IF NOT EXISTS "ts_audit_actor_idx" ON "timesheet_audit_log" ("actor_id");
CREATE INDEX IF NOT EXISTS "ts_audit_created_idx" ON "timesheet_audit_log" ("created_at");

-- Add proxy_user_id to timesheet_entries
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "proxy_user_id" varchar REFERENCES "users"("id");
