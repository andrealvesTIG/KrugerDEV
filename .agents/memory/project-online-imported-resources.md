---
name: Project Online timesheet sync — match-only, no auto-create
description: The MS Project Online timesheet sync matches against existing workspace data only, reports unmatched rows, and never creates resources/users.
---

# Project Online timesheet sync is match-only

The live MS Project Online timesheet sync matches incoming actual-work rows
against people, projects, and tasks that already exist in the workspace. Anything
it can't match (unknown person, project, or task) is **reported as unmatched** in
both preview and import — it is never auto-created.

**Why:** the task spec (`.local/tasks/mspo-timesheet-sync.md`) puts auto-creating
resources/users out of scope. An earlier implementation auto-created a resource +
lightweight user account per unknown person; code review rejected it as
out-of-scope. Do not reintroduce any create-on-import path (`findResourcesToCreate`,
`ensureImportedResource`, `creating-resources` stream events, resource-created
counters) — they were deliberately removed.

**Auth gate:** integration management lives under Org Settings → Integrations, so
the sync routes are gated on `PERMISSIONS.ORG_MANAGE_SETTINGS` (org-admin), not
`TIMESHEET_APPROVE`.

**All-resources visibility:** the connected Project Online account may only see its
own resources. `fetchResourceDirectory()` returns `{uidToEmail, distinctResources}`;
when only one distinct resource is visible the sync surfaces
`allResourcesVisible:false` + a `permissionWarning` in both preview and import
done-summaries (and records it in audit metadata). The wizard shows a warning
banner so admins know the import may be incomplete.

**How to apply:** keep preview and import behavior identical — both match against
the same real context and report (never create) unmatched rows. `timesheetEntries.userId`
is still `notNull`, so an imported row can only be written for a person who already
maps to a workspace user; rows without such a mapping stay unmatched.
