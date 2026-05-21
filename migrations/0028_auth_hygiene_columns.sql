-- Task #7: Auth & permission hygiene
--
-- Adds the columns relied on by the new RBAC hygiene paths:
--
--   1. organization_members.deleted_at / deleted_by — soft-delete columns
--      so removing a member no longer hard-deletes their row. The
--      authorization service filters `IS NULL` everywhere, so any value
--      flips the member to "revoked" without losing audit history.
--
--   2. users.permissions_version — bumped whenever a member is removed
--      (and any future revocation surface) so a long-lived session can
--      be force-revalidated against the live row.
--
-- Idempotent: uses IF NOT EXISTS so re-running on a DB that already had
-- `db:push` applied is a no-op.

ALTER TABLE "organization_members"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissions_version" integer DEFAULT 0 NOT NULL;
