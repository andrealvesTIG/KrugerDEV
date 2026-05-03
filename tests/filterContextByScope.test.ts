import { describe, it, expect } from 'vitest';
import { filterContextByScope, type JarvisContext } from '../server/services/jarvisService';

function makeCtx(overrides: Partial<JarvisContext> = {}): JarvisContext {
  const base: JarvisContext = {
    projects: [
      { id: 1, portfolioId: 10 } as any,
      { id: 2, portfolioId: 10 } as any,
      { id: 3, portfolioId: 20 } as any,
    ],
    portfolios: [
      { id: 10 } as any,
      { id: 20 } as any,
    ],
    risks: [],
    issues: [],
    tasks: [],
    milestones: [],
    dependencies: [],
    statusReports: [],
    healthHistory: [],
    financialsRollup: [],
    timesheetsRollup: [],
    deliverables: [],
    evmTimePhased: [
      { projectId: 1 } as any,
      { projectId: 2 } as any,
      { projectId: 3 } as any,
    ],
    burndowns: [
      { projectId: 1 } as any,
      { projectId: 2 } as any,
      { projectId: 3 } as any,
    ],
  } as any;
  return { ...base, ...overrides };
}

describe('filterContextByScope — chart datasets respect scope', () => {
  it('passes everything through for org scope', () => {
    const ctx = makeCtx();
    const out = filterContextByScope(ctx, { type: 'org' } as any);
    expect(out.evmTimePhased.map(s => s.projectId)).toEqual([1, 2, 3]);
    expect(out.burndowns.map(b => b.projectId)).toEqual([1, 2, 3]);
  });

  it('drops out-of-scope projects from evmTimePhased and burndowns when scoped to specific projects', () => {
    const ctx = makeCtx();
    const out = filterContextByScope(ctx, { type: 'projects', projectIds: [2] } as any);
    expect(out.evmTimePhased.map(s => s.projectId)).toEqual([2]);
    expect(out.burndowns.map(b => b.projectId)).toEqual([2]);
    expect(out.projects.map((p: any) => p.id)).toEqual([2]);
  });

  it('drops out-of-scope projects from chart datasets when scoped to portfolios', () => {
    const ctx = makeCtx();
    const out = filterContextByScope(ctx, { type: 'portfolios', portfolioIds: [10] } as any);
    // Portfolio 10 contains projects 1 and 2; project 3 (portfolio 20) must be excluded.
    expect(out.evmTimePhased.map(s => s.projectId).sort()).toEqual([1, 2]);
    expect(out.burndowns.map(b => b.projectId).sort()).toEqual([1, 2]);
    expect(out.evmTimePhased.find(s => s.projectId === 3)).toBeUndefined();
    expect(out.burndowns.find(b => b.projectId === 3)).toBeUndefined();
  });
});
