---
name: Per-project configurable form blocks
description: How to add a new per-project "block" (table/grid section) that admins can drop into the configurable project form, and the test gotcha when adding routes.
---

# Adding a per-project form block

A "block" is a composite section (table + CRUD dialog) shown on the project Summary/form,
placed by admins via Settings → Governance → Project Form. Model new ones on the
`software_licenses` block (per-project, structured columns, no cross-project reuse).
`executive_summaries` / `pmo_comments` use an extra junction table for cross-project reuse —
only follow those if reuse across projects is genuinely needed.

Touchpoints to wire end-to-end (all required):
1. `shared/schema.ts` — table + insert/update Zod schemas + types.
2. `server/storage/<feature>Storage.ts` — CRUD + a `enrich()` that adds createdByName/updatedByName.
3. `server/storage/types.ts` — add an `I<Feature>Storage` interface AND add it to the `IStorage extends` union.
4. `server/storage.ts` — `import * as ... ` and spread into the `storage` object.
5. `server/routes/<feature>Routes.ts` — register fn; gate every route with `getUserIdFromRequest` + `userHasOrgAccess` (peer blocks do membership-gate only, no per-block permission keys).
6. `server/routes.ts` — import + call the register fn.
7. `client/src/hooks/use-<feature>.ts` — query + mutations.
8. `client/src/components/project/<Feature>Block.tsx` — the UI.
9. `shared/projectFormRegistry.ts` — add an entry to `PROJECT_FORM_BLOCKS` (its `key` is the `itemKey`).
10. `client/src/components/project/ProjectFormRenderer.tsx` — import block + add `if (item.itemKey === "<key>")` branch.

## Gotchas
- After editing `shared/schema.ts` you MUST run `npm run db:push` or boot aborts (schema-drift check).
- **`tests/openapiCoverage.test.ts` has `RAW_ROUTE_BASELINE`** — a cap on raw `app.<method>("/api/...")` calls in `server/routes`+`server/services`. Adding N new raw routes fails this test; bump the baseline by N (these block routes legitimately use the raw pattern, not the integration-docs registry).
- Numeric columns: insert-schema transforms accept string|number and coerce; refine with `Number.isFinite` to reject bad input cleanly instead of a cryptic DB error.
