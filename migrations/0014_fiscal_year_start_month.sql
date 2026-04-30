-- Task #21: Configurable fiscal year start month per organization
-- Additive only; safe to run on environments that already have db:push applied.
-- Adds organizations.fiscal_year_start_month (1..12, default 10 = October).
-- Existing rows are backfilled to the prior hardcoded behavior (October) so
-- nothing changes until an admin updates the setting from Org Settings → Financials.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "fiscal_year_start_month" integer NOT NULL DEFAULT 10;
