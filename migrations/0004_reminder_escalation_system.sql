CREATE TABLE IF NOT EXISTS "timesheet_reminder_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "enabled" boolean DEFAULT true,
  "email_enabled" boolean DEFAULT true,
  "notification_enabled" boolean DEFAULT true,
  "submission_reminder_days" jsonb DEFAULT '[4, 5, 8]',
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

CREATE UNIQUE INDEX IF NOT EXISTS "trs_org_idx" ON "timesheet_reminder_settings" ("organization_id");

CREATE TABLE IF NOT EXISTS "timesheet_reminder_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "reminder_type" text NOT NULL,
  "week_start" date NOT NULL,
  "urgency_level" text DEFAULT 'friendly',
  "email_sent" boolean DEFAULT false,
  "notification_created" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "trl_org_idx" ON "timesheet_reminder_log" ("organization_id");
CREATE INDEX IF NOT EXISTS "trl_user_week_idx" ON "timesheet_reminder_log" ("user_id", "week_start");

CREATE TABLE IF NOT EXISTS "timesheet_reminder_snooze" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "week_start" date NOT NULL,
  "snoozed_until" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "trsnz_user_week_idx" ON "timesheet_reminder_snooze" ("user_id", "week_start");

CREATE TABLE IF NOT EXISTS "timesheet_escalation_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "entry_user_id" varchar NOT NULL REFERENCES "users"("id"),
  "manager_id" varchar REFERENCES "users"("id"),
  "escalated_to_id" varchar REFERENCES "users"("id"),
  "week_start" date NOT NULL,
  "reason" text,
  "email_sent" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tel_org_idx" ON "timesheet_escalation_log" ("organization_id");
CREATE INDEX IF NOT EXISTS "tel_user_week_idx" ON "timesheet_escalation_log" ("entry_user_id", "week_start");
