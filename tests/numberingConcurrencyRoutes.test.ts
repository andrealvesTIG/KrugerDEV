import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration-style test that fires N concurrent POSTs through the actual
// change-order and construction-invoice routes and asserts every response
// carries a distinct number. Backs the helper-level test in
// numberingConcurrency.test.ts with proof that the wiring at the route layer
// is correct end-to-end (atomic counter + unique-index backstop in place).
//
// We can't bring up Postgres inside the unit-test sandbox, so the mock `db`
// emulates the two surfaces the routes actually touch:
//   - `db.execute(<sql template>)`  → atomic counter (per-row queue, like the
//                                     row lock Postgres holds during the
//                                     UPDATE half of `ON CONFLICT DO UPDATE`)
//   - `db.select / .insert / .update / .delete` → no-op fluent chains that
//                                     return the project lookup row when
//                                     queried and echo inserts back via
//                                     `.returning()`.

const { dbState } = vi.hoisted(() => ({
  dbState: {
    counters: new Map<string, number>(),
    queues: new Map<string, Promise<unknown>>(),
    insertedNumbers: { invoice: new Set<string>(), changeOrder: new Set<string>() },
    lastInsertedTable: null as any,
    autoId: 0,
  },
}));

const { helpersMock } = vi.hoisted(() => ({
  helpersMock: {
    getUserIdFromRequest: vi.fn(() => 'user-1'),
    userHasOrgAccess: vi.fn(async () => true),
    isTeamMemberInOrg: vi.fn(async () => false),
    getTeamMemberProjectIds: vi.fn(async () => [] as number[]),
    classifyError: (err: unknown) => ({ status: 500, message: (err as any)?.message || 'err' }),
    logUserActivity: vi.fn(),
  },
}));

vi.mock('../server/routes/helpers', () => helpersMock);

vi.mock('../server/db', () => {
  function isStringChunk(c: any) {
    return c && typeof c === 'object' && Array.isArray(c.value);
  }
  function execute(sqlObj: any) {
    // Extract scope + projectId from the drizzle sql template params and
    // serialise per row. Concurrent calls for the same (scope, projectId)
    // each see a different `value`, exactly like Postgres.
    const params = (sqlObj?.queryChunks ?? []).filter((c: any) => !isStringChunk(c));
    const [scope, projectId] = params;
    const key = `${scope}|${projectId}`;
    const prev = dbState.queues.get(key) ?? Promise.resolve();
    const op = prev.then(async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 2));
      const next = (dbState.counters.get(key) ?? 0) + 1;
      dbState.counters.set(key, next);
      return { rows: [{ value: next }] };
    });
    dbState.queues.set(key, op.catch(() => {}));
    return op;
  }

  function makeReturning(table: any, values: any) {
    const rows = Array.isArray(values) ? values : [values];
    const out: any[] = [];
    for (const row of rows) {
      dbState.autoId += 1;
      const final = { id: dbState.autoId, createdAt: new Date(), ...row };
      out.push(final);
      // Track inserted numbering — also enforce the partial-unique-index
      // backstop in-memory so any future regression that bypasses the
      // counter is caught by this test, not lost in mock noise.
      if (table && row?.invoiceNumber) {
        if (dbState.insertedNumbers.invoice.has(row.invoiceNumber)) {
          throw new Error(`unique violation: invoice ${row.invoiceNumber}`);
        }
        dbState.insertedNumbers.invoice.add(row.invoiceNumber);
      }
      if (table && row?.changeOrderNumber) {
        if (dbState.insertedNumbers.changeOrder.has(row.changeOrderNumber)) {
          throw new Error(`unique violation: change order ${row.changeOrderNumber}`);
        }
        dbState.insertedNumbers.changeOrder.add(row.changeOrderNumber);
      }
    }
    return out;
  }

  function selectChain() {
    const chain: any = {
      from() { return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit() { return chain; },
      innerJoin() { return chain; },
      leftJoin() { return chain; },
      groupBy() { return chain; },
      then(resolve: any, reject?: any) {
        // Return a single project row so verifyProjectAccess succeeds.
        return Promise.resolve([{ id: 1, organizationId: 1, name: 'P1', contractTotal: '0' }])
          .then(resolve, reject);
      },
    };
    return chain;
  }

  function insertChain(table: any) {
    let captured: any;
    const chain: any = {
      values(v: any) { captured = v; return chain; },
      returning() { return Promise.resolve(makeReturning(table, captured)); },
      then(resolve: any, reject?: any) {
        return Promise.resolve(makeReturning(table, captured)).then(resolve, reject);
      },
    };
    return chain;
  }

  function updateChain() {
    const chain: any = {
      set() { return chain; },
      where() { return chain; },
      returning() { return Promise.resolve([{ id: 1 }]); },
      then(resolve: any, reject?: any) { return Promise.resolve(undefined).then(resolve, reject); },
    };
    return chain;
  }

  function deleteChain() {
    const chain: any = {
      where() { return chain; },
      then(resolve: any, reject?: any) { return Promise.resolve(undefined).then(resolve, reject); },
    };
    return chain;
  }

  return {
    db: {
      execute,
      select: () => selectChain(),
      insert: (t: any) => insertChain(t),
      update: () => updateChain(),
      delete: () => deleteChain(),
    },
  };
});

// Avoid loading the real storage layer which pulls in lots of unrelated wiring.
vi.mock('../server/storage', () => ({ storage: {} }));

import express from 'express';
import request from 'supertest';
import { registerChangeOrderRoutes } from '../server/routes/changeOrderRoutes';
import { registerConstructionInvoiceRoutes } from '../server/routes/constructionInvoiceRoutes';

function buildApp() {
  const app = express();
  app.use(express.json());
  registerChangeOrderRoutes(app);
  registerConstructionInvoiceRoutes(app);
  return app;
}

beforeEach(() => {
  dbState.counters.clear();
  dbState.queues.clear();
  dbState.insertedNumbers.invoice.clear();
  dbState.insertedNumbers.changeOrder.clear();
  dbState.autoId = 0;
});

describe('Route-level concurrent numbering (integration shape)', () => {
  it('20 parallel POSTs to /change-orders all receive distinct numbers', async () => {
    const app = buildApp();
    const N = 20;
    const responses = await Promise.all(
      Array.from({ length: N }, () =>
        request(app)
          .post('/api/projects/1/change-orders')
          .send({ title: 'CO', tier: 'PCO' }),
      ),
    );
    for (const r of responses) expect(r.status).toBe(201);
    const numbers = responses.map((r) => r.body.changeOrderNumber);
    expect(new Set(numbers).size).toBe(N);
    expect(numbers.every((n) => /^PCO-\d{3}$/.test(n))).toBe(true);
  });

  it('20 parallel POSTs to /construction-invoices all receive distinct numbers', async () => {
    const app = buildApp();
    const N = 20;
    const responses = await Promise.all(
      Array.from({ length: N }, () =>
        request(app)
          .post('/api/projects/1/construction-invoices')
          .send({ title: 'Pay app', periodFrom: '2025-01-01', periodTo: '2025-01-31' }),
      ),
    );
    for (const r of responses) expect(r.status).toBe(201);
    const numbers = responses.map((r) => r.body.invoiceNumber);
    expect(new Set(numbers).size).toBe(N);
    expect(numbers.every((n) => /^PAY-\d{3}$/.test(n))).toBe(true);
  });

  it('rejects money fields submitted as JS numbers (boundary contract)', async () => {
    const app = buildApp();
    // Sending a raw `number` for a money field must fail validation — JS
    // floats are not allowed on the wire, only decimal strings.
    const res = await request(app)
      .post('/api/projects/1/change-orders')
      .send({ title: 'CO', tier: 'PCO', costImpact: 12.34 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/string|number/i);

    // Same money value, but as a string — accepted.
    const ok = await request(app)
      .post('/api/projects/1/change-orders')
      .send({ title: 'CO', tier: 'PCO', costImpact: '12.34' });
    expect(ok.status).toBe(201);
  });
});
