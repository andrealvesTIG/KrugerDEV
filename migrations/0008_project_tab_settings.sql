-- Task #19: Org-level project tab default order + visibility
-- Additive only; safe to run on environments that already have db:push applied.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "project_tab_settings" jsonb;
