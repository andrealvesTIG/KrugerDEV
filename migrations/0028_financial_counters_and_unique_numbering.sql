-- Task #8: financial-layer integrity.
--
-- 1. New `financial_counters` table backing atomic per-(scope, project)
--    numbering for change-orders and construction invoices. The service
--    layer allocates the next value via
--    `INSERT ... ON CONFLICT (scope, project_id) DO UPDATE
--      SET value = financial_counters.value + 1 RETURNING value`,
--    which Postgres serialises on the conflicting row — so concurrent
--    creates always get distinct numbers, replacing the racey
--    `SELECT max(num)+1` pattern.
--
-- 2. Partial unique indexes on `change_orders.(project_id,
--    change_order_number)` and `construction_invoices.(project_id,
--    invoice_number)` as a DB-level safety net. Partial on
--    `deleted_at IS NULL AND <number> IS NOT NULL` so soft-deleted rows
--    can recycle their number and rows that haven't been numbered yet
--    don't collide.
--
-- All statements are idempotent so this migration is safe to re-apply on
-- environments that already picked the schema up via `drizzle-kit push`.

CREATE TABLE IF NOT EXISTS "financial_counters" (
  "scope"       text                                NOT NULL,
  "project_id"  integer                             NOT NULL REFERENCES "projects"("id"),
  "value"       integer    DEFAULT 0                NOT NULL,
  "updated_at"  timestamp  DEFAULT now()            NOT NULL,
  CONSTRAINT "financial_counters_pk" PRIMARY KEY ("scope", "project_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "change_orders_project_number_unique"
  ON "change_orders" ("project_id", "change_order_number")
  WHERE "deleted_at" IS NULL AND "change_order_number" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "construction_invoices_project_number_unique"
  ON "construction_invoices" ("project_id", "invoice_number")
  WHERE "deleted_at" IS NULL AND "invoice_number" IS NOT NULL;
