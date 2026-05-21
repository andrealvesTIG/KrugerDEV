import { describe, it, expect, beforeEach, vi } from 'vitest';

// ----- Mocks: keep storage in-memory so we can drive `assertNotLocked`
// table-style across every write-path scenario without spinning Postgres up.

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getOrganization: vi.fn(),
    getActiveLockdownMap: vi.fn(),
  },
}));

vi.mock('../server/storage', () => ({ storage: storageMock }));

import { assertNotLocked, monthEndIso } from '../server/services/financialLockdownService';

beforeEach(() => {
  storageMock.getOrganization.mockReset();
  storageMock.getActiveLockdownMap.mockReset();
  storageMock.getOrganization.mockResolvedValue({ id: 1, fiscalYearStartMonth: 1 } as any);
});

describe('monthEndIso', () => {
  it.each([
    [2025, 1, '2025-01-31'],
    [2025, 2, '2025-02-28'],
    [2024, 2, '2024-02-29'],
    [2025, 4, '2025-04-30'],
    [2025, 12, '2025-12-31'],
  ])('month-end for %i-%i is %s', (y, m, expected) => {
    expect(monthEndIso(y, m)).toBe(expected);
  });
});

describe('assertNotLocked — table-driven coverage of every write path', () => {
  // Scenario rows mirror the four write paths the helper protects:
  //   - PUT  /financial-cells           (single cell edit)
  //   - POST /financial-cells/bulk-clear (batch wipe)
  //   - DEL  /financial-items/:itemKey   (drop full item)
  //   - POST /change-orders/:id/approve  (CO approval)
  // For each path we exercise (a) no lockdown → null, (b) typeKey-scoped
  // lockdown that traps the period, (c) lockdown on a DIFFERENT type while
  // editing an unlocked type, (d) untyped query (CO approval) that trips on
  // any locked type.
  const SCENARIOS: Array<{
    name: string;
    lockdownMap: Record<string, string>;
    args: Parameters<typeof assertNotLocked>[0];
    expectLocked: boolean;
    expectedKey?: string;
  }> = [
    {
      name: 'PUT /financial-cells — no lockdowns at all → allowed',
      lockdownMap: {},
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 3, typeKey: 'aop' },
      expectLocked: false,
    },
    {
      name: 'PUT /financial-cells — aop locked through Mar; editing Mar aop → blocked',
      lockdownMap: { aop: '2025-03-31' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 3, typeKey: 'aop' },
      expectLocked: true,
      expectedKey: 'aop',
    },
    {
      name: 'PUT /financial-cells — aop locked through Mar; editing Apr aop → allowed',
      lockdownMap: { aop: '2025-03-31' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 4, typeKey: 'aop' },
      expectLocked: false,
    },
    {
      name: 'PUT /financial-cells — aop locked, editing fcst on same month → allowed (different type)',
      lockdownMap: { aop: '2025-03-31' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 3, typeKey: 'fcst' },
      expectLocked: false,
    },
    {
      name: 'bulk-clear — typed query for locked period → blocked',
      lockdownMap: { act: '2025-06-30' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 6, typeKey: 'act' },
      expectLocked: true,
      expectedKey: 'act',
    },
    {
      name: 'item-delete — calendar boundary: cell exactly ON lockdown date → blocked',
      lockdownMap: { aop: '2025-12-31' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 12, typeKey: 'aop' },
      expectLocked: true,
      expectedKey: 'aop',
    },
    {
      name: 'CO approval — untyped, any type locked covering this month → blocked',
      lockdownMap: { aop: '2025-03-31', fcst: '2025-01-31' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 2 },
      expectLocked: true,
    },
    {
      name: 'CO approval — untyped, no lockdown covers this month → allowed',
      lockdownMap: { aop: '2025-01-31' },
      args: { organizationId: 1, calendarYear: 2025, calendarMonth: 6 },
      expectLocked: false,
    },
    {
      name: 'fiscal input form is translated via org fiscalYearStartMonth and respected',
      lockdownMap: { aop: '2025-03-31' },
      args: { organizationId: 1, fiscalYear: 2025, fiscalMonth: 3, typeKey: 'aop' },
      expectLocked: true,
      expectedKey: 'aop',
    },
  ];

  // --- Fiscal-year shift regression coverage ----------------------------
  // The bug the reviewer flagged: storage.getFinancialEntries() returns
  // rows in FISCAL coordinates (FY label + M1..M12 in fiscal order). If a
  // caller mistakenly passes those as calendar coordinates to
  // assertNotLocked, the check lands on the wrong calendar month for any
  // org whose FY does not start in January — silently allowing deletes
  // inside locked periods (or blocking edits on unlocked ones). These
  // table rows pin the correct fiscal→calendar translation for the three
  // FY starts we see in production (Jan, Apr, Oct).
  // FY label = the calendar year in which the FY ENDS (per
  // shared/lib/fiscalCalendar.ts: buildFiscalMonths).
  //   FY=Apr  (start=4): FY2025 runs Apr 2024 → Mar 2025.
  //     M1  = 2024-04, M10 = 2025-01, M12 = 2025-03
  //   FY=Oct (start=10): FY2025 runs Oct 2024 → Sep 2025.
  //     M1  = 2024-10, M4  = 2025-01, M12 = 2025-09
  const FY_SHIFTS = [
    {
      name: 'FY=Apr — FY2025 M10 (calendar 2025-01) is locked by aop=2025-01-31',
      fyStart: 4, lockdownMap: { aop: '2025-01-31' },
      args: { fiscalYear: 2025, fiscalMonth: 10 },
      expectLocked: true,
    },
    {
      name: 'FY=Apr — FY2026 M1 (calendar 2025-04) is NOT locked by aop=2025-03-31',
      fyStart: 4, lockdownMap: { aop: '2025-03-31' },
      args: { fiscalYear: 2026, fiscalMonth: 1 },
      expectLocked: false,
    },
    {
      name: 'FY=Oct — FY2025 M1 (calendar 2024-10) IS locked by aop=2024-12-31',
      fyStart: 10, lockdownMap: { aop: '2024-12-31' },
      args: { fiscalYear: 2025, fiscalMonth: 1 },
      expectLocked: true,
    },
    {
      name: 'FY=Oct — FY2025 M4 (calendar 2025-01) is NOT locked by aop=2024-12-31',
      fyStart: 10, lockdownMap: { aop: '2024-12-31' },
      args: { fiscalYear: 2025, fiscalMonth: 4 },
      expectLocked: false,
    },
    // Regression for the reviewer's specific finding: misreading fiscal-as-
    // calendar in DELETE /financial-items would treat fiscalMonth=1 as
    // calendar Jan and miss an Apr-start lockdown that covers Apr 2024.
    {
      name: 'FY=Apr regression — FY2025 M1 (calendar 2024-04) IS locked by aop=2024-06-30',
      fyStart: 4, lockdownMap: { aop: '2024-06-30' },
      args: { fiscalYear: 2025, fiscalMonth: 1 },
      expectLocked: true,
    },
  ];

  it.each(FY_SHIFTS)('fiscal-year shift: $name', async (s) => {
    storageMock.getOrganization.mockResolvedValue({ id: 1, fiscalYearStartMonth: s.fyStart } as any);
    storageMock.getActiveLockdownMap.mockResolvedValue(s.lockdownMap);
    const result = await assertNotLocked({
      organizationId: 1,
      ...s.args,
      typeKey: 'aop',
    });
    if (s.expectLocked) expect(result).not.toBeNull();
    else expect(result).toBeNull();
  });

  it.each(SCENARIOS)('$name', async (scenario) => {
    storageMock.getActiveLockdownMap.mockResolvedValue(scenario.lockdownMap);
    const result = await assertNotLocked(scenario.args);

    if (scenario.expectLocked) {
      expect(result).not.toBeNull();
      expect(result!.lockdownDate).toBeTruthy();
      if (scenario.expectedKey) {
        expect(result!.financialTypeKey).toBe(scenario.expectedKey);
      }
    } else {
      expect(result).toBeNull();
    }
  });

  it('returns a 409-shaped payload (typeKey + lockdownDate + cellMonthEnd + message)', async () => {
    storageMock.getActiveLockdownMap.mockResolvedValue({ aop: '2025-03-31' });
    const v = await assertNotLocked({
      organizationId: 1, calendarYear: 2025, calendarMonth: 3, typeKey: 'aop',
    });
    expect(v).toMatchObject({
      financialTypeKey: 'aop',
      lockdownDate: '2025-03-31',
      cellMonthEnd: '2025-03-31',
    });
    expect(v!.message).toMatch(/locked through 2025-03-31/);
  });

  it('throws when neither calendar nor fiscal coordinates are supplied', async () => {
    storageMock.getActiveLockdownMap.mockResolvedValue({});
    await expect(assertNotLocked({ organizationId: 1, typeKey: 'aop' } as any)).rejects.toThrow();
  });
});
