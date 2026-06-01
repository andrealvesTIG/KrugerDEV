---
name: Project Online imported-resource auto-creation
description: How/why the MS Project Online timesheet sync auto-creates resources + lightweight accounts, and how idempotency is achieved without new columns.
---

# Auto-creating resources during Project Online timesheet sync

When the live MS Project Online timesheet sync meets a person who has no resource
in Friday Report, it creates BOTH a resource and a lightweight user account so
their hours import in the same run. The account has no password and can't sign in
until the person logs in normally.

**Why a user account is required:** `timesheetEntries.userId` is `notNull`, so an
imported entry can't be written without a user. `resources.userId` is nullable, but
the entry needs a user regardless.

**Idempotency without schema changes:** deliberately did NOT add
`externalSource`/`externalId` columns to the `resources` table (avoids db:push).
Re-run safety comes from two layers:
- caller-side `findResourcesToCreate(rows, existing)` skips anyone matching an
  existing resource by email OR name (dedupes candidates by email else name);
- storage `ensureImportedResource` finds-or-creates the user by email (synthetic
  `po-<externalId-or-name-slug>@imported.local` when the feed has no email) and
  then looks up an existing resource by (organizationId, userId) before inserting,
  returning the existing one if present.

**How to apply:** any change to the sync's resource-creation path must preserve the
org+userId resource lookup (the real idempotency guard) — relying on the pure
dedupe alone is not enough under re-runs/concurrency. Keep preview and import in
sync: preview simulates the to-create resources in the match context so its
"unmatched" count reflects only truly unknown projects/tasks, matching import.

**Scope boundary:** existing resources that lack a user account are still reported
as unmatched (not auto-given accounts) — only people fully absent from the
workspace get auto-created.
