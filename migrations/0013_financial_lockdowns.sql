-- Task #19: Financial lockdown dates
-- Additive only; safe to run on environments that already have db:push applied.

CREATE TABLE IF NOT EXISTS "financial_lockdowns" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "financial_type_key" text NOT NULL,
  "lockdown_date" date NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT NOW() NOT NULL,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT NOW() NOT NULL,
  "updated_by" varchar REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_financial_lockdowns_org"
  ON "financial_lockdowns" ("organization_id");

CREATE INDEX IF NOT EXISTS "idx_financial_lockdowns_org_type"
  ON "financial_lockdowns" ("organization_id", "financial_type_key");

CREATE INDEX IF NOT EXISTS "idx_financial_lockdowns_org_type_date"
  ON "financial_lockdowns" ("organization_id", "financial_type_key", "lockdown_date" DESC);
