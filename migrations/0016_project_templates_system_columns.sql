-- Task #44: Add the system-library columns to project_templates so the
-- built-in template seeders (IT, Healthcare, Financial Services,
-- Manufacturing, Industrial Automation, Capital Projects, Energy &
-- Utilities, Government & Public Sector) can populate the Templates page.
--
-- Background: the Drizzle schema, every industry seeder, and the
-- /templates UI all expect 7 columns that did not exist in the live
-- database. As a result every seed query crashed on startup with
-- `column "is_system" does not exist`, no built-in templates were ever
-- created, and every industry tab rendered "No templates available yet".
--
-- This migration is idempotent (IF NOT EXISTS on every column and index)
-- and additive only — no existing data is touched.
--
-- IMPORTANT: this is a manual ALTER TABLE migration on purpose. Do NOT
-- use `db:push` for changes like this when there is live data in the
-- table; Drizzle would offer to drop+recreate columns and lose rows.

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false;

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "industry" text;

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "category" text;

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "slug" text;

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "icon" text;

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "estimated_duration_days" integer;

ALTER TABLE "project_templates"
  ADD COLUMN IF NOT EXISTS "summary" text;

CREATE UNIQUE INDEX IF NOT EXISTS "project_templates_slug_unique"
  ON "project_templates" ("slug");

CREATE INDEX IF NOT EXISTS "project_templates_industry_idx"
  ON "project_templates" ("industry");

-- The Drizzle schema explicitly declares organization_id as nullable so that
-- platform-seeded system templates can be org-less. The live database had it
-- as NOT NULL, which caused every system-template insert to fail with
-- `null value in column "organization_id" violates not-null constraint`.
ALTER TABLE "project_templates"
  ALTER COLUMN "organization_id" DROP NOT NULL;
