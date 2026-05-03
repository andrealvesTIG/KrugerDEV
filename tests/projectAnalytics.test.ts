import { describe, it, expect, beforeEach, vi } from 'vitest';

const { fixtures } = vi.hoisted(() => ({ fixtures: new Map<any, any[]>() }));

vi.mock('../server/db', () => {
  const makeChain = () => {
    let table: any;
    const chain: any = {
      from(t: any) { table = t; return chain; },
      where() { return chain; },
      groupBy() { return chain; },
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

import { financialEntries, costItems, tasks, projects } from '@shared/schema';
import {
  gatherProjectEvmSeries,
  gatherProjectBurndowns,
} from '../server/services/projectAnalytics';

beforeEach(() => fixtures.clear());

function setFixture(table: any, rows: any[]) {
  fixtures.set(table, rows);
}

// Calendar-anchored monthly AOP/ACT entries for a project.
function makeEntries(opts: {
  projectId: number;
  fiscalYear: number; // calendar year for FY-start=Jan
  aopMonthly?: number[];
  actMonthly?: number[];
  fcstMonthly?: number[];
}) {
  const rows: any[] = [];
  const push = (scenario: string, arr?: number[]) => {
    if (!arr) return;
    arr.forEach((amount, i) => {
      if (amount === 0) return;
      rows.push({
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
  push('fcst', opts.fcstMonthly);
  return rows;
}

describe('gatherProjectEvmSeries', () => {
  it('returns empty payload when no projects are given', async () => {
    const out = await gatherProjectEvmSeries(1, [], new Date('2026-06-15'));
    expect(out.projects).toEqual([]);
    expect(out.months).toHaveLength(12);
  });

  it('produces monotonic cumulative PV/AC and an asOfIndex aligned to today', async () => {
    const today = new Date('2026-06-15'); // FY=2026 (FY start=Jan), as-of month = 6
    setFixture(projects, [{ id: 7, completionPercentage: 50 }]);
    setFixture(financialEntries, makeEntries({
      projectId: 7,
      fiscalYear: 2026,
      aopMonthly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      actMonthly: [90, 110, 100, 100, 100, 100, 0, 0, 0, 0, 0, 0],
    }));
    setFixture(costItems, []);
    setFixture(tasks, []);

    const { asOfMonth, projects: out } = await gatherProjectEvmSeries(1, [7], today);
    expect(asOfMonth).toBe(6);
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.asOfIndex).toBe(5);
    expect(p.bac).toBe(1200);
    // Cumulative arrays must be monotonic non-decreasing.
    for (let i = 1; i < 12; i++) {
      expect(p.points[i].pvCum).toBeGreaterThanOrEqual(p.points[i - 1].pvCum);
      expect(p.points[i].acCum).toBeGreaterThanOrEqual(p.points[i - 1].acCum);
      expect(p.points[i].evCum).toBeGreaterThanOrEqual(p.points[i - 1].evCum);
    }
    // EV at as-of = bac * pcFraction (50%) when PV>0.
    expect(p.points[5].evCum).toBe(600);
    // EV stays flat after as-of (no more credit until more progress).
    expect(p.points[11].evCum).toBe(600);
    // PV should be cumulative aop.
    expect(p.points[5].pvCum).toBe(600);
    expect(p.points[11].pvCum).toBe(1200);
    // AC matches sum of actuals through as-of.
    expect(p.points[5].acCum).toBe(600);
  });

  it('omits projects with no plottable EVM data', async () => {
    setFixture(projects, [{ id: 9, completionPercentage: 0 }]);
    setFixture(financialEntries, []);
    setFixture(costItems, []);
    setFixture(tasks, []);
    const { projects: out } = await gatherProjectEvmSeries(1, [9], new Date('2026-06-15'));
    expect(out).toEqual([]);
  });

  it('falls back to cost_items.aopTotal for BAC when there are no AOP entries', async () => {
    const today = new Date('2026-06-15');
    setFixture(projects, [{ id: 11, completionPercentage: 0 }]);
    setFixture(financialEntries, makeEntries({
      projectId: 11,
      fiscalYear: 2026,
      actMonthly: [10, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0],
    }));
    setFixture(costItems, [{ projectId: 11, total: '5000' }]);
    setFixture(tasks, []);
    const { projects: out } = await gatherProjectEvmSeries(1, [11], today);
    expect(out[0].bac).toBe(5000);
  });

  it('EAC = AC YTD + Forecast remaining', async () => {
    const today = new Date('2026-06-15');
    setFixture(projects, [{ id: 12, completionPercentage: 0 }]);
    setFixture(financialEntries, makeEntries({
      projectId: 12,
      fiscalYear: 2026,
      aopMonthly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      actMonthly: [110, 110, 110, 110, 110, 110, 0, 0, 0, 0, 0, 0],
      fcstMonthly: [0, 0, 0, 0, 0, 0, 120, 120, 120, 120, 120, 120],
    }));
    setFixture(costItems, []);
    setFixture(tasks, []);
    const { projects: out } = await gatherProjectEvmSeries(1, [12], today);
    expect(out[0].eacComputed).toBe(110 * 6 + 120 * 6);
    expect(out[0].points[11].eacCum).toBe(out[0].eacComputed);
  });
});

describe('gatherProjectBurndowns', () => {
  it('returns empty for empty project list', async () => {
    const out = await gatherProjectBurndowns([], new Date('2026-06-15'));
    expect(out).toEqual([]);
  });

  it('picks `hrs` unit when any task has estimatedHours and computes ideal endpoints', async () => {
    const today = new Date('2026-06-15');
    setFixture(projects, [{ id: 1, startDate: '2026-01-01', endDate: '2026-12-31' }]);
    setFixture(tasks, [
      {
        id: 100, projectId: 1, status: 'In Progress', progress: 0,
        startDate: '2026-01-01', endDate: '2026-06-30', actualEndDate: null,
        estimatedHours: '40', durationDays: '30', isMilestone: false, isSummary: false,
      },
      {
        id: 101, projectId: 1, status: 'In Progress', progress: 0,
        startDate: '2026-07-01', endDate: '2026-12-31', actualEndDate: null,
        estimatedHours: '60', durationDays: '60', isMilestone: false, isSummary: false,
      },
    ]);
    const out = await gatherProjectBurndowns([1], today);
    expect(out).toHaveLength(1);
    const b = out[0];
    expect(b.unit).toBe('hrs');
    expect(b.totalWork).toBe(100);
    // First bucket's ideal should be < total (we burn down, never up).
    expect(b.points[0].ideal).toBeLessThan(b.totalWork);
    // Final bucket's ideal should be at zero.
    expect(b.points[b.points.length - 1].ideal).toBe(0);
    // asOfIndex must point at the last bucket whose end <= today.
    expect(b.asOfIndex).toBeGreaterThanOrEqual(0);
    expect(b.asOfIndex).toBeLessThan(b.points.length);
    // Buckets after asOfIndex have null actuals.
    for (let i = b.asOfIndex + 1; i < b.points.length; i++) {
      expect(b.points[i].actual).toBeNull();
    }
  });

  it('subtracts completed work anchored on actualEndDate (or endDate for status=Completed)', async () => {
    const today = new Date('2026-06-15');
    setFixture(projects, [{ id: 2, startDate: '2026-01-01', endDate: '2026-12-31' }]);
    setFixture(tasks, [
      // Completed in Jan with actualEndDate.
      {
        id: 200, projectId: 2, status: 'Completed', progress: 100,
        startDate: '2026-01-01', endDate: '2026-01-31', actualEndDate: '2026-01-20',
        estimatedHours: '10', durationDays: null, isMilestone: false, isSummary: false,
      },
      // Completed but no actualEndDate — falls back to endDate.
      {
        id: 201, projectId: 2, status: 'Completed', progress: 100,
        startDate: '2026-02-01', endDate: '2026-02-28', actualEndDate: null,
        estimatedHours: '20', durationDays: null, isMilestone: false, isSummary: false,
      },
      // In progress, won't burn until today bucket.
      {
        id: 202, projectId: 2, status: 'In Progress', progress: 0,
        startDate: '2026-03-01', endDate: '2026-12-31', actualEndDate: null,
        estimatedHours: '30', durationDays: null, isMilestone: false, isSummary: false,
      },
    ]);
    const out = await gatherProjectBurndowns([2], today);
    const b = out[0];
    expect(b.totalWork).toBe(60);
    // The latest historical bucket (asOfIndex) should reflect both completed
    // tasks burned down (60 - 10 - 20 = 30 remaining).
    expect(b.points[b.asOfIndex].actual).toBe(30);
  });

  it('skips milestones, summaries, and projects with no plottable window', async () => {
    setFixture(projects, [
      { id: 3, startDate: null, endDate: null },
      { id: 4, startDate: '2026-01-01', endDate: '2026-12-31' },
    ]);
    setFixture(tasks, [
      // Project 3: only milestones/summaries → totalWork=0 → skipped.
      {
        id: 300, projectId: 3, status: 'In Progress', progress: 0,
        startDate: '2026-01-01', endDate: '2026-06-30', actualEndDate: null,
        estimatedHours: '40', durationDays: null, isMilestone: true, isSummary: false,
      },
      {
        id: 301, projectId: 3, status: 'In Progress', progress: 0,
        startDate: '2026-01-01', endDate: '2026-06-30', actualEndDate: null,
        estimatedHours: '40', durationDays: null, isMilestone: false, isSummary: true,
      },
      // Project 4: a normal task.
      {
        id: 400, projectId: 4, status: 'In Progress', progress: 0,
        startDate: '2026-01-01', endDate: '2026-12-31', actualEndDate: null,
        estimatedHours: '40', durationDays: null, isMilestone: false, isSummary: false,
      },
    ]);
    const out = await gatherProjectBurndowns([3, 4], new Date('2026-06-15'));
    expect(out.map(b => b.projectId)).toEqual([4]);
  });
});
