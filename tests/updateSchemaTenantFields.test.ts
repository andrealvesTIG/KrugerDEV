/**
 * Build-failing regression: every `update*Schema` exported from
 * `shared/schema.ts` must strip tenant / audit fields. A client must not be
 * able to reparent an entity to a different organisation, mark it as demo
 * data, or rewrite `createdBy` / `createdAt` by smuggling those keys
 * through a PUT body.
 *
 * The test introspects each Zod object schema's shape and asserts that the
 * forbidden keys are absent. Adding a new update schema that accepts any of
 * them will fail this test.
 */
import { describe, it, expect } from "vitest";
import * as schema from "@shared/schema";
import { z, ZodObject } from "zod";

// Every tenant / audit field the task brief calls out. None of these should
// be writable through an update schema — they are server-managed or scope
// the row to a tenant and must not be reparentable from a client payload.
const FORBIDDEN = [
  "organizationId",
  "isDemo",
  "createdBy",
  "createdAt",
  "archivedAt",
] as const;

function unwrap(s: any): ZodObject<any> | null {
  let cur = s;
  // Tolerate `.partial()`, `.extend()`, `.omit()`, `.superRefine()` etc. by
  // walking inner schemas until we find a ZodObject (or give up).
  for (let i = 0; i < 6 && cur; i++) {
    if (cur instanceof ZodObject) return cur;
    cur = cur?._def?.schema || cur?._def?.innerType;
  }
  return null;
}

describe("update*Schema — tenant/audit fields are stripped", () => {
  const entries = Object.entries(schema).filter(([name]) => /^update[A-Z]\w*Schema$/.test(name));
  expect(entries.length).toBeGreaterThan(0);

  for (const [name, value] of entries) {
    if (!(value as any)?._def) continue;
    const obj = unwrap(value);
    if (!obj) continue; // Not a ZodObject (e.g. a refined union) — skip.
    for (const key of FORBIDDEN) {
      it(`${name} does not accept '${key}'`, () => {
        expect(Object.keys(obj.shape)).not.toContain(key);
      });
    }
  }
});
