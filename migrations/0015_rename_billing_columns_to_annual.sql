-- Task #42: Rename plan billing columns to match the annual-pricing schema.
-- Idempotent and safe to re-run; preserves all existing rows and FKs.
--
-- Background: code, Drizzle schema, seed, and admin UI all expect
-- `annual_price_cents` and `included_units_annual`, but the live database
-- still had the legacy `monthly_*` names. Every SELECT against the plans
-- table (and its plan_meter_rules join) returned 500 with
-- "column does not exist", which made the Super Admin Plans grid empty
-- and broke the public /api/billing/plans endpoint.
--
-- IMPORTANT: This is a manual ALTER TABLE rename on purpose. Do NOT use
-- `db:push` for column renames — Drizzle would drop and recreate the
-- column and wipe live pricing/quota data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'monthly_price_cents'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'annual_price_cents'
  ) THEN
    ALTER TABLE "plans" RENAME COLUMN "monthly_price_cents" TO "annual_price_cents";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_meter_rules' AND column_name = 'included_units_monthly'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_meter_rules' AND column_name = 'included_units_annual'
  ) THEN
    ALTER TABLE "plan_meter_rules" RENAME COLUMN "included_units_monthly" TO "included_units_annual";
  END IF;
END $$;
