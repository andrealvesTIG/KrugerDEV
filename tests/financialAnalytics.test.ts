import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Module-level mocks (must be hoisted before importing the route) -------

// Hoisted shared state so vi.mock factories (also hoisted) can reach them.
const { helpersMock, storageMock, fixtures } = vi.hoisted(() => {
  return {
    helpersMock: {
      getUserIdFromRequest: vi.fn(),
      userHasOrgAccess: vi.fn(),
      isTeamMemberInOrg: vi.fn(),
      getTeamMemberProjectIds: vi.fn(),
    },
    storageMock: {
      getOrganization: vi.fn(),
    },
    fixtures: new Map<any, any[]>(),
  };
});

vi.mock('../server/routes/helpers', () => helpersMock);
vi.mock('../server/storage', () => ({ storage: storageMock }));

vi.mock('../server/db', () => {
  const makeChain = () => {
    let table: any;
    const chain: any = {
      from(t: any) { table = t; return chain; },
      where() { return chain; },
      groupBy() { return chain; },
      leftJoin() { return chain; },
      innerJoin() { return chain; },
      orderBy() { return chain; },
      limit() { return chain; },
      then(resolve: any, reject?: any) {
        const data = fixtures.get(table) ?? [];
        return Promise.resolve(data).then(resolve, reject);
      },
    };
    return chain;
  };
  return { db: { select: (..._args: any[]) => makeChain() } };
});

// ---- Now import the route + framework after mocks are in place. -----------

import express from 'express';
import request from 'supertest';
import { registerFinancialsRoutes } from '../server/routes/financialsRoutes';
import {
  projects,
  portfolios,
  costItems,
  tasks,
  financialEntries,
} from '@shared/schema';

// ---- Helpers ---------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  registerFinancialsRoutes(app);
  return app;
}

function setOrg(opts: { id: number; fyStartMonth?: number } = { id: 1 }) {
  storageMock.getOrganization.mockImplementation(async (orgId: number) => {
    if (orgId !== opts.id) return undefined;
    return {
      id: opts.id,
      name: 'Acme',
      fiscalYearStartMonth: opts.fyStartMonth ?? 1,
    } as any;
  });
}

function loginAs(userId: string, opts: {
  orgAccess?: boolean;
  teamMember?: boolean;
  teamProjectIds?: number[];
} = {}) {
  helpersMock.getUserIdFromRequest.mockReturnValue(userId);
  helpersMock.userHasOrgAccess.mockResolvedValue(opts.orgAccess ?? true);
  helpersMock.isTeamMemberInOrg.mockResolvedValue(opts.teamMember ?? false);
  helpersMock.getTeamMemberProjectIds.mockResolvedValue(opts.teamProjectIds ?? []);
}

function logout() {
  helpersMock.getUserIdFromRequest.mockReturnValue(undefined);
  helpersMock.userHasOrgAccess.mockResolvedValue(false);
  helpersMock.isTeamMemberInOrg.mockResolvedValue(false);
  helpersMock.getTeamMemberProjectIds.mockResolvedValue([]);
}

function makeProject(p: Partial<any> & { id: number; organizationId: number }) {
  return {
    name: `Project ${p.id}`,
    portfolioId: null,
    status: 'active',
    health: 'green',
    completionPercentage: 0,
    startDate: null,
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    deletedAt: null,
    ...p,
  };
}

/** Build a 12-month AOP/ACT entry list for a project in the given FY. */
function makeEntries(opts: {
  projectId: number;
  fiscalYear: number;
  aopMonthly?: number[]; // length 12, calendar-month aligned
  actMonthly?: number[];
  eacMonthly?: number[];
}) {
  const out: any[] = [];
  const push = (scenario: string, arr?: number[]) => {
    if (!arr) return;
    arr.forEach((amount, i) => {
      if (!amount) return;
      out.push({
        projectId: opts.projectId,
        fiscalYear: opts.fiscalYear,
        month: i + 1,
        scenario,
        amount,
      });
    });
  };
  push('aop', opts.aopMonthly);
  push('act', opts.actMonthly);
  push('eac', opts.eacMonthly);
  return out;
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  fixtures.clear();
  storageMock.getOrganization.mockReset();
  helpersMock.getUserIdFromRequest.mockReset();
  helpersMock.userHasOrgAccess.mockReset();
  helpersMock.isTeamMemberInOrg.mockReset();
  helpersMock.getTeamMemberProjectIds.mockReset();
});

describe('GET /api/organizations/:orgId/financial-analytics — auth & RBAC', () => {
  it('returns 401 when no user is on the request', async () => {
    setOrg({ id: 1 });
    logout();
    const res = await request(buildApp()).get('/api/organizations/1/financial-analytics');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Authentication/i);
  });

  it('returns 403 when the user lacks org access', async () => {
    setOrg({ id: 1 });
    loginAs('u1', { orgAccess: false });
    const res = await request(buildApp()).get('/api/organizations/1/financial-analytics');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Access denied/i);
  });

  it('org admins (non-team-member) see every project in the org', async () => {
    setOrg({ id: 1 });
    loginAs('admin', { orgAccess: true, teamMember: false });
    fixtures.set(projects, [
      makeProject({ id: 10, organizationId: 1 }),
      makeProject({ id: 11, organizationId: 1 }),
      makeProject({ id: 12, organizationId: 1 }),
    ]);
    fixtures.set(portfolios, []);
    const res = await request(buildApp()).get('/api/organizations/1/financial-analytics');
    expect(res.status).toBe(200);
    const ids = res.body.projects.map((p: any) => p.projectId).sort();
    expect(ids).toEqual([10, 11, 12]);
  });

  it('team-members are restricted to their assigned projects only', async () => {
    setOrg({ id: 1 });
    loginAs('tm1', {
      orgAccess: true,
      teamMember: true,
      teamProjectIds: [11],
    });
    fixtures.set(projects, [
      makeProject({ id: 10, organizationId: 1 }),
      makeProject({ id: 11, organizationId: 1 }),
      makeProject({ id: 12, organizationId: 1 }),
    ]);
    fixtures.set(portfolios, []);
    const res = await request(buildApp()).get('/api/organizations/1/financial-analytics');
    expect(res.status).toBe(200);
    expect(res.body.projects.map((p: any) => p.projectId)).toEqual([11]);
  });
});

describe('GET /api/organizations/:orgId/financial-analytics — portfolioId filter', () => {
  it('restricts the rollup to the requested portfolio', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    fixtures.set(projects, [
      makeProject({ id: 10, organizationId: 1, portfolioId: 100 }),
      makeProject({ id: 11, organizationId: 1, portfolioId: 200 }),
      makeProject({ id: 12, organizationId: 1, portfolioId: 100 }),
    ]);
    fixtures.set(portfolios, [
      { id: 100, organizationId: 1, name: 'Alpha' },
      { id: 200, organizationId: 1, name: 'Beta' },
    ]);
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?portfolioId=100');
    expect(res.status).toBe(200);
    expect(res.body.projects.map((p: any) => p.projectId).sort()).toEqual([10, 12]);
    // Portfolios output should only include the filtered portfolio.
    const portfolioIds = res.body.portfolios.map((p: any) => p.portfolioId);
    expect(portfolioIds).toEqual([100]);
  });
});

describe('GET /api/organizations/:orgId/financial-analytics — asOfMonth semantics', () => {
  it('asOfMonth = 0 for a future fiscal year', async () => {
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    fixtures.set(projects, []);
    fixtures.set(portfolios, []);
    const futureFy = new Date().getFullYear() + 5;
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${futureFy}`);
    expect(res.status).toBe(200);
    expect(res.body.asOfMonth).toBe(0);
    expect(res.body.fiscalYear).toBe(futureFy);
  });

  it('asOfMonth = 12 for a past fiscal year', async () => {
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    fixtures.set(projects, []);
    fixtures.set(portfolios, []);
    const pastFy = new Date().getFullYear() - 5;
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${pastFy}`);
    expect(res.status).toBe(200);
    expect(res.body.asOfMonth).toBe(12);
  });

  it('asOfMonth = current calendar month for the current fiscal year (calendar FY)', async () => {
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    fixtures.set(projects, []);
    fixtures.set(portfolios, []);
    const currentFy = new Date().getFullYear();
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${currentFy}`);
    expect(res.status).toBe(200);
    // For a calendar FY, fiscal-month index == calendar month.
    const expected = new Date().getUTCMonth() + 1;
    expect(res.body.asOfMonth).toBe(expected);
  });
});

describe('GET /api/organizations/:orgId/financial-analytics — EVM math', () => {
  it('computes BAC/PV/AC/EV/CPI/SPI from cost_items + entries + project completion (past FY, all actuals)', async () => {
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    const pastFy = new Date().getFullYear() - 5; // ensures asOfMonth = 12
    fixtures.set(projects, [
      makeProject({
        id: 10,
        organizationId: 1,
        portfolioId: null,
        completionPercentage: 50,
      }),
    ]);
    fixtures.set(portfolios, []);
    // BAC source: entries-presence based. Project HAS aop entries (sum=1200),
    // so BAC = sum of AOP entries = 1200 (cost_items is fallback only).
    fixtures.set(costItems, [{ projectId: 10, total: '999999' }]);
    // No task progress → falls back to project.completionPercentage = 50%.
    fixtures.set(tasks, []);
    // Entries: AOP 100/mo (sum=1200), ACT 80/mo (sum=960).
    fixtures.set(financialEntries, makeEntries({
      projectId: 10,
      fiscalYear: pastFy,
      aopMonthly: Array(12).fill(100),
      actMonthly: Array(12).fill(80),
    }));
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${pastFy}`);
    expect(res.status).toBe(200);
    const proj = res.body.projects[0];
    expect(proj.bac).toBe(1200);
    expect(proj.ac).toBe(960);
    expect(proj.pv).toBe(1200); // PV at as-of (12) = full AOP curve
    // EV = BAC * pcFraction = 1200 * 0.5 = 600
    expect(proj.ev).toBeCloseTo(600, 6);
    // CPI = EV / AC = 600 / 960 = 0.625
    expect(proj.cpi).toBeCloseTo(0.625, 6);
    // SPI = EV / PV = 600 / 1200 = 0.5
    expect(proj.spi).toBeCloseTo(0.5, 6);
  });

  it('eacComputed is bottoms-up (Actuals YTD + Forecast remaining), matching the project grid', async () => {
    // Past FY → asOfMonth = 12 → no future months → EAC = AC + 0 = total ACT.
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    const pastFy = new Date().getFullYear() - 5;
    fixtures.set(projects, [
      makeProject({ id: 10, organizationId: 1, completionPercentage: 50 }),
    ]);
    fixtures.set(portfolios, []);
    fixtures.set(costItems, []);
    fixtures.set(tasks, []);
    fixtures.set(financialEntries, makeEntries({
      projectId: 10,
      fiscalYear: pastFy,
      aopMonthly: Array(12).fill(100), // BAC = 1200
      actMonthly: Array(12).fill(80),  // AC  = 960, no FCST → bottoms-up EAC = 960
    }));
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${pastFy}`);
    expect(res.status).toBe(200);
    const proj = res.body.projects[0];
    expect(proj.eacComputed).toBeCloseTo(960, 4);
    // VAC = BAC - EAC; varianceVsBudget = EAC - BAC (positive = over budget)
    expect(proj.vac).toBeCloseTo(1200 - 960, 4);
    expect(proj.varianceVsBudget).toBeCloseTo(960 - 1200, 4);
    // ETC = max(0, EAC - AC) = 0
    expect(proj.etc).toBe(0);
  });

  it('entered EAC entries are informational only — eacComputed stays bottoms-up', async () => {
    // After Task #46, entered EAC entries no longer override the bottoms-up
    // total. They are surfaced as `eacEntered` but ignored for VAC / ranking.
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    const pastFy = new Date().getFullYear() - 5;
    fixtures.set(projects, [
      makeProject({ id: 10, organizationId: 1, completionPercentage: 50 }),
    ]);
    fixtures.set(portfolios, []);
    fixtures.set(costItems, []);
    fixtures.set(tasks, []);
    fixtures.set(financialEntries, makeEntries({
      projectId: 10,
      fiscalYear: pastFy,
      aopMonthly: Array(12).fill(100), // BAC=1200
      actMonthly: Array(12).fill(80),  // AC=960
      eacMonthly: Array(12).fill(125), // eacEntered=1500 (informational)
    }));
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${pastFy}`);
    expect(res.status).toBe(200);
    const proj = res.body.projects[0];
    expect(proj.eacEntered).toBe(1500);
    expect(proj.eacComputed).toBeCloseTo(960, 4); // bottoms-up wins
  });

  it('falls back to summed AOP entries for BAC when no cost_items exist', async () => {
    setOrg({ id: 1, fyStartMonth: 1 });
    loginAs('admin');
    const pastFy = new Date().getFullYear() - 5;
    fixtures.set(projects, [
      makeProject({ id: 10, organizationId: 1, completionPercentage: 100 }),
    ]);
    fixtures.set(portfolios, []);
    fixtures.set(costItems, []); // no authoritative BAC
    fixtures.set(tasks, []);
    fixtures.set(financialEntries, makeEntries({
      projectId: 10,
      fiscalYear: pastFy,
      aopMonthly: Array(12).fill(50), // BAC fallback = 600
      actMonthly: Array(12).fill(50),
    }));
    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${pastFy}`);
    expect(res.status).toBe(200);
    const proj = res.body.projects[0];
    expect(proj.bac).toBe(600);
    // 100% complete + on-budget → CPI = 1, SPI = 1
    expect(proj.cpi).toBeCloseTo(1, 6);
    expect(proj.spi).toBeCloseTo(1, 6);
    expect(proj.eacComputed).toBeCloseTo(600, 4);
  });
});

describe('GET /api/organizations/:orgId/financial-analytics — input validation', () => {
  it('returns 404 when the organization does not exist', async () => {
    storageMock.getOrganization.mockResolvedValue(undefined);
    loginAs('admin');
    const res = await request(buildApp()).get('/api/organizations/999/financial-analytics');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric orgId', async () => {
    loginAs('admin');
    const res = await request(buildApp()).get('/api/organizations/abc/financial-analytics');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/orgId/i);
  });

  it('returns 400 for zero / negative orgId', async () => {
    loginAs('admin');
    const res = await request(buildApp()).get('/api/organizations/0/financial-analytics');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/orgId/i);
  });

  it('returns 400 for non-numeric fiscalYear', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?fiscalYear=notayear');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fiscalYear/i);
  });

  it('returns 400 for out-of-range fiscalYear', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?fiscalYear=999');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fiscalYear/i);
  });

  it('returns 400 for non-numeric portfolioId', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?portfolioId=foo');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/portfolioId/i);
  });

  it('returns 400 for zero / negative portfolioId', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?portfolioId=-5');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/portfolioId/i);
  });

  it('returns 400 for floating-point portfolioId', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?portfolioId=3.14');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/portfolioId/i);
  });

  it('returns 404 when portfolioId does not belong to the org', async () => {
    setOrg({ id: 1 });
    loginAs('admin');
    fixtures.set(portfolios, []); // portfolio 9999 not in this org
    const res = await request(buildApp())
      .get('/api/organizations/1/financial-analytics?portfolioId=9999');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/portfolio.*9999.*not found/i);
  });

  it('error messages explain what was wrong (clear for the dashboard error card)', async () => {
    loginAs('admin');
    const res = await request(buildApp()).get('/api/organizations/abc/financial-analytics');
    expect(res.status).toBe(400);
    // Message should describe what went wrong in plain terms.
    expect(res.body.message).toMatch(/positive integer/i);
  });
});

describe('GET /api/organizations/:orgId/financial-analytics — non-calendar fiscal year', () => {
  it('honors fyStartMonth=4 (Apr-start FY) when computing in-progress asOfMonth', async () => {
    // Pick a fiscal year that's currently in progress under an Apr-start FY
    // and verify the in-progress-month math. The codebase convention is:
    //   FY label = the calendar year in which the FY *ends*.
    // With fyStartMonth=4: FY label N spans Apr(N-1) → Mar(N). So today's
    // calendar (year, month) maps to:
    //   if today.month >= 4: fyLabel=today.year + 1, fmIdx = month - 4 + 1
    //   else:                fyLabel=today.year,     fmIdx = month + 12 - 4 + 1
    setOrg({ id: 1, fyStartMonth: 4 });
    loginAs('admin');
    fixtures.set(projects, []);
    fixtures.set(portfolios, []);

    const today = new Date();
    const calMonth = today.getUTCMonth() + 1; // 1..12
    const calYear = today.getUTCFullYear();
    const fyLabel = calMonth >= 4 ? calYear + 1 : calYear;
    const expectedFmIdx = calMonth >= 4 ? calMonth - 4 + 1 : calMonth + 12 - 4 + 1;

    const res = await request(buildApp())
      .get(`/api/organizations/1/financial-analytics?fiscalYear=${fyLabel}`);
    expect(res.status).toBe(200);
    expect(res.body.fiscalYear).toBe(fyLabel);
    expect(res.body.fiscalYearStartMonth).toBe(4);
    expect(res.body.asOfMonth).toBe(expectedFmIdx);
  });
});
