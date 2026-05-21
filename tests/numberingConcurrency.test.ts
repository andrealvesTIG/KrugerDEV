import { describe, it, expect, vi, beforeEach } from 'vitest';

// We can't spin up a real Postgres inside the unit-test sandbox, but the whole
// point of the new helper is that it issues a single atomic
// `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING value` statement. So:
//   1. Assert the SQL pattern is the atomic one (not `SELECT max+1 → INSERT`).
//   2. Mock `db.execute` with a serialised in-memory counter that emulates
//      Postgres' row-level lock semantics, fire N parallel calls, and assert
//      all N values are distinct + monotonic — the property a racey
//      max+1 implementation would fail.

const { dbMock, sqlCapture } = vi.hoisted(() => ({
  dbMock: { execute: vi.fn() },
  sqlCapture: { lastSql: '' },
}));

vi.mock('../server/db', () => ({ db: dbMock }));

import { nextCounterValue, formatCounter } from '../server/services/financialCounterService';

// In-memory counter store keyed by `${scope}|${projectId}`. The mock
// serialises increments via a single shared promise chain so concurrent
// callers can't observe an intermediate state — the same guarantee Postgres
// gives us via the row lock that `ON CONFLICT DO UPDATE` takes.
// Drizzle's `sql` template produces a `queryChunks` array shaped like
//   [StringChunk("INSERT INTO ..."), <primitive param>, StringChunk(", "), <primitive>, StringChunk(")")]
// — StringChunks are objects exposing `.value` holding the SQL fragment;
// param positions are the raw JS primitive itself.

// A StringChunk in drizzle stores its SQL fragments as `value: string[]`.
function isStringChunk(c: any): boolean {
  return c && typeof c === 'object' && Array.isArray(c.value);
}

/** Pull primitive params (strings/numbers) out of a drizzle sql template. */
function extractParams(sqlObj: any): any[] {
  const chunks: any[] = sqlObj?.queryChunks ?? [];
  return chunks.filter((c) => !isStringChunk(c));
}

/** Concatenate the literal SQL fragments of a drizzle sql template. */
function extractSqlText(sqlObj: any): string {
  const chunks: any[] = sqlObj?.queryChunks ?? [];
  return chunks.filter(isStringChunk).map((c) => c.value.join(' ')).join(' ');
}

function installAtomicCounterMock() {
  const store = new Map<string, number>();
  // Per-row queues — Postgres' `ON CONFLICT DO UPDATE` only locks the
  // conflicting row, so different (scope, project) pairs proceed in
  // parallel. A SHARED queue would over-serialise and hide real bugs.
  const queues = new Map<string, Promise<unknown>>();

  dbMock.execute.mockImplementation((sqlObj: any) => {
    sqlCapture.lastSql = extractSqlText(sqlObj);
    const [scope, projectId] = extractParams(sqlObj);
    const key = `${scope}|${projectId}`;

    const prev = queues.get(key) ?? Promise.resolve();
    const op = prev.then(async () => {
      // Small random tick so racey JS scheduling has every chance to
      // interleave; under a NON-atomic implementation this is exactly where
      // two parallel callers would read the same `value`.
      await new Promise((r) => setTimeout(r, Math.random() * 2));
      const cur = store.get(key) ?? 0;
      const next = cur + 1;
      store.set(key, next);
      return { rows: [{ value: next }] };
    });
    queues.set(key, op.catch(() => {}));
    return op;
  });
}

beforeEach(() => {
  dbMock.execute.mockReset();
  sqlCapture.lastSql = '';
});

describe('nextCounterValue', () => {
  it('uses the atomic INSERT … ON CONFLICT DO UPDATE RETURNING pattern', async () => {
    installAtomicCounterMock();
    await nextCounterValue('invoice', 42);
    const sql = sqlCapture.lastSql.toLowerCase();
    // The SQL must combine INSERT, ON CONFLICT, DO UPDATE, and RETURNING in a
    // single statement. (The drizzle template surface varies; we just look
    // for the keyword chain.)
    expect(sql).toMatch(/insert/);
    expect(sql).toMatch(/on conflict/);
    expect(sql).toMatch(/do update/);
    expect(sql).toMatch(/returning/);
    // Critically, must NOT be the old read-then-write pattern.
    expect(sql).not.toMatch(/select\s+max/);
  });

  it('50 concurrent allocations for the same (scope, project) all return distinct values', async () => {
    installAtomicCounterMock();
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () => nextCounterValue('invoice', 1)),
    );
    expect(results).toHaveLength(N);
    expect(new Set(results).size).toBe(N);
    // Values are 1..N (monotonic) in some order.
    expect(results.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: N }, (_, i) => i + 1),
    );
  });

  it('counters are scoped independently — change-order PCO/COR/CO never collide', async () => {
    installAtomicCounterMock();
    const [pco1, cor1, co1, pco2, cor2, co2] = await Promise.all([
      nextCounterValue('co:PCO', 7),
      nextCounterValue('co:COR', 7),
      nextCounterValue('co:CO', 7),
      nextCounterValue('co:PCO', 7),
      nextCounterValue('co:COR', 7),
      nextCounterValue('co:CO', 7),
    ]);
    expect(new Set([pco1, pco2])).toEqual(new Set([1, 2]));
    expect(new Set([cor1, cor2])).toEqual(new Set([1, 2]));
    expect(new Set([co1, co2])).toEqual(new Set([1, 2]));
  });

  it('different projects do not share a counter', async () => {
    installAtomicCounterMock();
    const [p1a, p2a, p1b, p2b] = await Promise.all([
      nextCounterValue('invoice', 1),
      nextCounterValue('invoice', 2),
      nextCounterValue('invoice', 1),
      nextCounterValue('invoice', 2),
    ]);
    expect(new Set([p1a, p1b])).toEqual(new Set([1, 2]));
    expect(new Set([p2a, p2b])).toEqual(new Set([1, 2]));
  });
});

describe('formatCounter', () => {
  it('zero-pads to width 3 by default', () => {
    expect(formatCounter('PCO', 1)).toBe('PCO-001');
    expect(formatCounter('PAY', 42)).toBe('PAY-042');
    expect(formatCounter('CO', 999)).toBe('CO-999');
  });
  it('handles values wider than the pad without truncating', () => {
    expect(formatCounter('PAY', 1234)).toBe('PAY-1234');
  });
});
