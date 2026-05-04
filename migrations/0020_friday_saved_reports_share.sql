-- Public shareable links for saved Friday reports.
-- A token-bearing URL (no login required) renders the report. Owners/admins
-- (and the saver) can rotate or revoke the token at any time. The unique
-- partial index keeps token lookups fast and prevents accidental reuse while
-- still allowing many rows to remain unshared (NULL token).

ALTER TABLE "friday_saved_reports" ADD COLUMN IF NOT EXISTS "share_token" text;
ALTER TABLE "friday_saved_reports" ADD COLUMN IF NOT EXISTS "shared_at" timestamp;
ALTER TABLE "friday_saved_reports" ADD COLUMN IF NOT EXISTS "shared_by_user_id" varchar
  REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "friday_saved_reports" ADD COLUMN IF NOT EXISTS "share_expires_at" timestamp;
ALTER TABLE "friday_saved_reports" ADD COLUMN IF NOT EXISTS "share_revoked_at" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "friday_saved_reports_share_token_idx"
  ON "friday_saved_reports" ("share_token");
