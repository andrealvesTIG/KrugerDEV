import { db } from "../db";
import { financialEntries, costItems, tasks, projects } from "@shared/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  buildFiscalMonths,
  currentFiscalYear,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";

export interface EvmMonthPoint {
  monthNum: number;
  label: string;
  year: number;
  month: number;
  pvCum: number;
  evCum: number;
  acCum: number;
  eacCum: number;
}

export interface ProjectEvmSeries {
  projectId: number;
  fiscalYear: number;
  asOfIndex: number; // -1 if FY hasn't started; otherwise 0..11
  /** Effective % complete used for EV (0..100). Task-weighted when any task
   *  reports progress, otherwise project-level completionPercentage. */
  pcRaw: number;
  bac: number;
  ac: number;
  pv: number;
  ev: number;
  eacEntered: number;
  eacComputed: number;
  vac: number;
  varianceVsBudget: number;
  etc: number;
  cpi: number;
  spi: number;
  // Monthly arrays (length 12) for chart series. NOT rounded — callers can
  // round when serializing if compactness matters.
  pvMonthly: number[];
  acMonthly: number[];
  fcstMonthly: number[];
  eacMonthly: number[];
  pvCum: number[];
  acCum: number[];
  evCum: number[];
  eacCum: number[];
  /** Rounded chart payload — convenient for compact JSON responses. */
  points: EvmMonthPoint[];
}

export const sumArr = (a: number[] | undefined): number =>
  a ? a.reduce((s, v) => s + v, 0) : 0;
export const cumArr = (a: number[] | undefined): number[] => {
  const out = Array<number>(12).fill(0);
  if (!a) return out;
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    acc += a[i] || 0;
    out[i] = acc;
  }
  return out;
};

/**
 * Inputs for the pure per-project EVM math. All monthly arrays are length 12,
 * indexed 0..11 by fiscal-month position (i.e. position 0 is the first month
 * of the fiscal year, regardless of calendar month).
 */
export interface ProjectEvmInputs {
  aopMonthly: number[];
  fcstMonthly: number[];
  actMonthly: number[];
  /** EAC entries from financial_entries, or null when no `eac` rows exist. */
  eacMonthlyEntered: number[] | null;
  /** Fallback BAC from cost_items.aopTotal, used only when `hasAopEntries` is false. */
  bacFallback: number;
  /** True iff there is at least one `aop` financial_entries row for the FY. */
  hasAopEntries: boolean;
  /** Effective % complete (0..100). Caller decides task-weighted vs project-level. */
  pcRaw: number;
  /** As-of fiscal-month index (0..12). 0 means the FY hasn't started. */
  asOfMonth: number;
}

export interface ProjectEvmCompute {
  bac: number;
  ac: number;
  pv: number;
  ev: number;
  cpi: number;
  spi: number;
  eacEntered: number;
  eacComputed: number;
  vac: number;
  varianceVsBudget: number;
  etc: number;
  pvCum: number[];
  acCum: number[];
  evCum: number[];
  eacMonthly: number[];
  eacCum: number[];
}

/**
 * Pure per-project EVM math. Single source of truth for both the per-org
 * Financials → S-Curve dashboard route and the Friday analytics helper, so a
 * future tweak (new EV strategy, new BAC source, etc.) only needs to be
 * applied in one place. Keep this pure (no DB access, no I/O) — caller is
 * responsible for assembling the per-project monthly buckets and scalars.
 */
export function computeProjectEvm(inp: ProjectEvmInputs): ProjectEvmCompute {
  const { aopMonthly, fcstMonthly, actMonthly, eacMonthlyEntered, bacFallback,
    hasAopEntries, pcRaw, asOfMonth } = inp;

  const pvCum = cumArr(aopMonthly);
  const acCum = cumArr(actMonthly);

  // BAC: presence-based fallback. Use AOP-entry sum when any `aop` row exists
  // (matches the project Financials grid by construction); otherwise fall back
  // to cost_items.aopTotal. A project that legitimately has all AOP buckets
  // persisted as zero is still treated as having a budget of zero.
  const bacEntries = sumArr(aopMonthly);
  const bac = hasAopEntries ? bacEntries : bacFallback;

  const pcFraction = Math.max(0, Math.min(1, pcRaw / 100));

  // EV strategy: PMI-conformant fallback — project-level % complete applied to
  // BAC, distributed across periods in proportion to the project's own planned
  // (PV) curve. Equivalent to Σ(cost_item.aopTotal × project_pc) when summed.
  const asOfIdx = Math.max(0, asOfMonth - 1);
  const pvAtAsOf = asOfMonth > 0 ? pvCum[asOfIdx] : 0;
  const evToDate = bac > 0 ? bac * pcFraction : 0;
  const evCum = Array<number>(12).fill(0);
  for (let i = 0; i < 12; i++) {
    if (asOfMonth === 0) { evCum[i] = 0; continue; }
    if (i <= asOfIdx) {
      evCum[i] = pvAtAsOf > 0
        ? evToDate * (pvCum[i] / pvAtAsOf)
        : evToDate * ((i + 1) / asOfMonth);
    } else {
      evCum[i] = evToDate;
    }
  }
  const ev = asOfMonth > 0 ? evCum[asOfIdx] : 0;
  const ac = asOfMonth > 0 ? acCum[asOfIdx] : 0;
  const pv = pvAtAsOf;
  const cpi = ac > 0 ? ev / ac : 1;
  const spi = pv > 0 ? ev / pv : 1;

  const eacEntered = eacMonthlyEntered ? sumArr(eacMonthlyEntered) : 0;

  // EAC: bottoms-up "Actuals YTD + Forecast remaining" — same definition the
  // project Financials grid uses, so dashboard and grid match by construction.
  // Strict cutoff semantics:
  //   asOfMonth === 0  → cutoff = -1 (FY not started; all 12 months forecast)
  //   asOfMonth === 12 → cutoff = 11 (FY over; all 12 months actuals)
  //   otherwise        → cutoff = asOfMonth - 1
  const cutoffIdx = asOfMonth === 0 ? -1 : asOfIdx;
  let actYTD = 0;
  for (let i = 0; i <= cutoffIdx; i++) actYTD += actMonthly[i] || 0;
  let fcstRemaining = 0;
  for (let i = cutoffIdx + 1; i < 12; i++) fcstRemaining += fcstMonthly[i] || 0;
  const eacComputed = actYTD + fcstRemaining;
  const vac = bac - eacComputed;
  const varianceVsBudget = eacComputed - bac;
  const etc = Math.max(0, eacComputed - ac);

  // EAC monthly curve: prefer entered series when explicitly captured;
  // otherwise synthesize AC for past/current months + ETC distributed across
  // future months in proportion to remaining AOP. Sums to `eacComputed`.
  let eacMonthly: number[];
  if (eacMonthlyEntered && eacMonthlyEntered.some(v => Number(v) !== 0)) {
    eacMonthly = eacMonthlyEntered.slice();
  } else {
    eacMonthly = Array<number>(12).fill(0);
    let futureAop = 0;
    for (let i = 0; i < 12; i++) {
      if (i < asOfMonth) eacMonthly[i] = actMonthly[i] || 0;
      else futureAop += aopMonthly[i] || 0;
    }
    const remainingMonths = Math.max(0, 12 - asOfMonth);
    for (let i = asOfMonth; i < 12; i++) {
      if (futureAop > 0) {
        eacMonthly[i] = etc * ((aopMonthly[i] || 0) / futureAop);
      } else if (remainingMonths > 0) {
        eacMonthly[i] = etc / remainingMonths;
      }
    }
  }
  const eacCum = cumArr(eacMonthly);

  return {
    bac, ac, pv, ev, cpi, spi,
    eacEntered, eacComputed, vac, varianceVsBudget, etc,
    pvCum, acCum, evCum, eacMonthly, eacCum,
  };
}

// Local row shapes — kept narrow so we don't have to lean on Drizzle's full
// $inferSelect for the few columns we actually consume.
interface FinancialEntryRow {
  projectId: number;
  fiscalYear: number;
  month: number;
  scenario: string;
  amount: string | number | null;
}
interface CostItemBacRow { projectId: number; total: string | number | null }
interface EvmTaskRow {
  projectId: number;
  progress: number | null;
  estimatedHours: string | number | null;
  durationDays: string | number | null;
}

/**
 * Compute time-phased EVM (PV/EV/AC/EAC, all cumulative) per project for the
 * current fiscal year, using the same math as the Financials → S-Curve
 * dashboard route in `financialsRoutes.ts`. Kept in a shared helper so Friday
 * can serve real EVM data instead of inferring from coarse rollups.
 */
export async function gatherProjectEvmSeries(
  fiscalYearStartMonth: number,
  projectIds: number[],
  today: Date = new Date(),
  options: { fiscalYear?: number; includeEmpty?: boolean } = {},
): Promise<{
  fiscalYear: number;
  asOfMonth: number;
  months: Array<{ monthNum: number; label: string; year: number; month: number }>;
  projects: ProjectEvmSeries[];
}> {
  const fyStart = normalizeFiscalYearStartMonth(fiscalYearStartMonth);
  const fiscalYear = options.fiscalYear ?? currentFiscalYear(today, fyStart);
  const includeEmpty = options.includeEmpty ?? false;
  const months = buildFiscalMonths(fiscalYear, fyStart);

  // as-of fiscal-month index (1..12). Computed before the empty-projects
  // early return so the dashboard route can rely on a correct asOfMonth even
  // for orgs/portfolios with no projects.
  const monthEnds = months.map(m => new Date(Date.UTC(m.year, m.month, 0)));
  let asOfMonth = 0;
  for (let i = 0; i < monthEnds.length; i++) {
    if (today >= monthEnds[i]) asOfMonth = i + 1;
    else break;
  }
  const fyStartDate = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const fyEndDate = monthEnds[11];
  if (today >= fyStartDate && today < fyEndDate) {
    const cur = today.getUTCMonth() + 1;
    const curYear = today.getUTCFullYear();
    const idx = months.findIndex(m => m.year === curYear && m.month === cur);
    if (idx >= 0 && idx + 1 > asOfMonth) asOfMonth = idx + 1;
  } else if (today >= fyEndDate) {
    asOfMonth = 12;
  }

  if (projectIds.length === 0) {
    return { fiscalYear, asOfMonth, months, projects: [] };
  }

  const calPairs = months.map(m => ({ year: m.year, month: m.month }));
  const calKey = (y: number, m: number) => `${y}-${m}`;
  const calIndex = new Map<string, number>();
  calPairs.forEach((p, i) => calIndex.set(calKey(p.year, p.month), i));

  // Each query is awaited via Promise.all so a failure surfaces as a thrown
  // error to the caller rather than being silently swallowed into an empty
  // chart payload — that gives Friday's caller a chance to log/diagnose
  // upstream and keeps the contract honest ("no data" really means no rows,
  // not "the query crashed").
  const [allEntries, costItemBac, taskRows, projectRows] = await Promise.all([
    db.select({
      projectId: financialEntries.projectId,
      fiscalYear: financialEntries.fiscalYear,
      month: financialEntries.month,
      scenario: financialEntries.scenario,
      amount: financialEntries.amount,
    })
      .from(financialEntries)
      .where(and(
        inArray(financialEntries.projectId, projectIds),
        or(...calPairs.map(p => and(
          eq(financialEntries.fiscalYear, p.year),
          eq(financialEntries.month, p.month),
        ))),
      )) as Promise<FinancialEntryRow[]>,
    db.select({
      projectId: costItems.projectId,
      total: sql<string>`COALESCE(SUM(${costItems.aopTotal}::numeric), 0)`.as("total"),
    })
      .from(costItems)
      .where(and(
        inArray(costItems.projectId, projectIds),
        eq(costItems.fiscalYear, fiscalYear),
      ))
      .groupBy(costItems.projectId) as Promise<CostItemBacRow[]>,
    db.select({
      projectId: tasks.projectId,
      progress: tasks.progress,
      estimatedHours: tasks.estimatedHours,
      durationDays: tasks.durationDays,
    })
      .from(tasks)
      .where(and(
        inArray(tasks.projectId, projectIds),
        isNull(tasks.deletedAt),
      )) as Promise<EvmTaskRow[]>,
    db.select({
      id: projects.id,
      completionPercentage: projects.completionPercentage,
    }).from(projects).where(inArray(projects.id, projectIds)),
  ]);

  const bacFromCostItems = new Map<number, number>();
  for (const r of costItemBac) {
    bacFromCostItems.set(r.projectId, Number(r.total) || 0);
  }

  // Task-progress weighted % per project (matches financialsRoutes).
  const accum = new Map<number, { num: number; den: number; anyProgress: boolean }>();
  for (const t of taskRows) {
    if (t.progress == null) continue;
    const w = Number(t.estimatedHours) || Number(t.durationDays) || 1;
    if (!Number.isFinite(w) || w <= 0) continue;
    const cur = accum.get(t.projectId) ?? { num: 0, den: 0, anyProgress: false };
    cur.num += w * Number(t.progress);
    cur.den += w;
    if (Number(t.progress) > 0) cur.anyProgress = true;
    accum.set(t.projectId, cur);
  }
  const taskProgressByProject = new Map<number, number>();
  for (const [pid, v] of accum.entries()) {
    if (v.anyProgress && v.den > 0) taskProgressByProject.set(pid, v.num / v.den);
  }

  const completionByProject = new Map<number, number>();
  for (const p of projectRows) {
    completionByProject.set(p.id, Number(p.completionPercentage ?? 0));
  }

  type Buckets = Record<string, number[]>;
  const perProject = new Map<number, Buckets>();
  for (const pid of projectIds) perProject.set(pid, {});
  for (const e of allEntries) {
    const buckets = perProject.get(e.projectId);
    if (!buckets) continue;
    const idx = calIndex.get(calKey(e.fiscalYear, e.month));
    if (idx === undefined) continue;
    const arr = buckets[e.scenario] ?? (buckets[e.scenario] = Array<number>(12).fill(0));
    arr[idx] += Number(e.amount) || 0;
  }

  const out: ProjectEvmSeries[] = [];
  for (const pid of projectIds) {
    const b = perProject.get(pid) ?? {};
    const aopArr = b["aop"] ?? Array<number>(12).fill(0);
    const fcstArr = b["fcst"] ?? Array<number>(12).fill(0);
    const actArr = b["act"] ?? Array<number>(12).fill(0);
    const eacArr = b["eac"] ?? null;
    const taskPc = taskProgressByProject.get(pid);
    const pcRaw = taskPc != null ? taskPc : (completionByProject.get(pid) ?? 0);

    const evm = computeProjectEvm({
      aopMonthly: aopArr,
      fcstMonthly: fcstArr,
      actMonthly: actArr,
      eacMonthlyEntered: eacArr,
      bacFallback: bacFromCostItems.get(pid) ?? 0,
      hasAopEntries: b["aop"] !== undefined,
      pcRaw,
      asOfMonth,
    });

    // Skip projects with no plottable EVM data at all (Friday's chart panel
    // doesn't want a flat line; the dashboard route opts back in via
    // `includeEmpty: true` so org admins still see every project row).
    if (!includeEmpty && evm.bac === 0 && evm.acCum[11] === 0 && evm.pvCum[11] === 0) continue;

    const points: EvmMonthPoint[] = months.map((m, i) => ({
      monthNum: m.monthNum,
      label: m.label,
      year: m.year,
      month: m.month,
      pvCum: Math.round(evm.pvCum[i]),
      evCum: Math.round(evm.evCum[i]),
      acCum: Math.round(evm.acCum[i]),
      eacCum: Math.round(evm.eacCum[i]),
    }));

    out.push({
      projectId: pid,
      fiscalYear,
      asOfIndex: asOfMonth > 0 ? Math.max(0, asOfMonth - 1) : -1,
      pcRaw,
      bac: evm.bac,
      ac: evm.ac,
      pv: evm.pv,
      ev: evm.ev,
      eacEntered: evm.eacEntered,
      eacComputed: evm.eacComputed,
      vac: evm.vac,
      varianceVsBudget: evm.varianceVsBudget,
      etc: evm.etc,
      cpi: evm.cpi,
      spi: evm.spi,
      pvMonthly: aopArr,
      acMonthly: actArr,
      fcstMonthly: fcstArr,
      eacMonthly: evm.eacMonthly,
      pvCum: evm.pvCum,
      acCum: evm.acCum,
      evCum: evm.evCum,
      eacCum: evm.eacCum,
      points,
    });
  }

  return { fiscalYear, asOfMonth, months, projects: out };
}

export interface BurndownPoint {
  label: string;
  date: string; // ISO YYYY-MM-DD (bucket end)
  ideal: number;
  actual: number | null; // null for buckets after today
}

export interface ProjectBurndown {
  projectId: number;
  unit: "hrs" | "days" | "tasks";
  totalWork: number;
  windowStart: string;
  windowEnd: string;
  asOfIndex: number; // index of last bucket whose end <= today
  points: BurndownPoint[];
}

interface BurndownTaskRow {
  id: number;
  projectId: number;
  status: string | null;
  progress: number | null;
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
  estimatedHours: string | number | null;
  durationDays: string | number | null;
  isMilestone: boolean | null;
  isSummary: boolean | null;
}

function taskWeight(t: BurndownTaskRow, unit: "hrs" | "days" | "tasks"): number {
  if (unit === "hrs") return Number(t.estimatedHours) || 0;
  if (unit === "days") return Number(t.durationDays) || 0;
  return 1;
}

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
] as const;

/**
 * Build an ideal-vs-actual remaining-work burndown series per project. Work is
 * weighted by `estimatedHours` when available, otherwise `durationDays`,
 * otherwise a per-task count of 1. Completion is anchored on
 * `actualEndDate ?? endDate` for tasks marked Completed (status==='Completed'
 * or progress===100); in-progress tasks contribute partial completion at
 * `today` so the line reflects current burn.
 */
export async function gatherProjectBurndowns(
  projectIds: number[],
  today: Date = new Date(),
): Promise<ProjectBurndown[]> {
  if (projectIds.length === 0) return [];

  // Same rationale as gatherProjectEvmSeries: query failures throw rather than
  // silently degrading, so callers can decide whether to fall back or surface
  // the error.
  const [taskRows, projectRows] = await Promise.all([
    db.select({
      id: tasks.id,
      projectId: tasks.projectId,
      status: tasks.status,
      progress: tasks.progress,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      actualEndDate: tasks.actualEndDate,
      estimatedHours: tasks.estimatedHours,
      durationDays: tasks.durationDays,
      isMilestone: tasks.isMilestone,
      isSummary: tasks.isSummary,
    }).from(tasks).where(and(
      inArray(tasks.projectId, projectIds),
      isNull(tasks.deletedAt),
    )) as Promise<BurndownTaskRow[]>,
    db.select({
      id: projects.id,
      startDate: projects.startDate,
      endDate: projects.endDate,
    }).from(projects).where(inArray(projects.id, projectIds)),
  ]);

  const projectMeta = new Map<number, { startDate: string | null; endDate: string | null }>();
  for (const p of projectRows) {
    projectMeta.set(p.id, {
      startDate: p.startDate ? String(p.startDate) : null,
      endDate: p.endDate ? String(p.endDate) : null,
    });
  }

  const tasksByProject = new Map<number, BurndownTaskRow[]>();
  for (const t of taskRows) {
    if (t.isMilestone || t.isSummary) continue;
    const list = tasksByProject.get(t.projectId) ?? [];
    list.push(t);
    tasksByProject.set(t.projectId, list);
  }

  const out: ProjectBurndown[] = [];
  const todayMs = today.getTime();

  for (const pid of projectIds) {
    const list = tasksByProject.get(pid) ?? [];
    if (list.length === 0) continue;

    // Decide unit: prefer hours if any task has estimatedHours.
    const hasHours = list.some(t => Number(t.estimatedHours) > 0);
    const hasDays = !hasHours && list.some(t => Number(t.durationDays) > 0);
    const unit: "hrs" | "days" | "tasks" = hasHours ? "hrs" : hasDays ? "days" : "tasks";

    let totalWork = 0;
    for (const t of list) totalWork += taskWeight(t, unit);
    if (totalWork <= 0) continue;

    // Project window: prefer project.startDate/endDate, else min/max task dates.
    const meta = projectMeta.get(pid) ?? { startDate: null, endDate: null };
    const taskStarts = list.map(t => t.startDate).filter((d): d is string => !!d);
    const taskEnds = list.map(t => t.endDate).filter((d): d is string => !!d);
    const startStr = meta.startDate ?? (taskStarts.length ? [...taskStarts].sort()[0] : null);
    const endStr = meta.endDate ?? (taskEnds.length ? [...taskEnds].sort().slice(-1)[0] : null);
    if (!startStr || !endStr) continue;
    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    // Build buckets across the window. Cap total bars so payload stays
    // reasonable.
    const spanDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
    const bucketCount = Math.min(16, Math.max(4, Math.ceil(spanDays / 14)));
    const stepMs = (endMs - startMs) / bucketCount;

    const points: BurndownPoint[] = [];
    let asOfIndex = -1;

    const fmtLabel = (d: Date): string => {
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      // Short label: "Mon D" if window <= 1 year, else include year.
      if (endMs - startMs <= 366 * 86_400_000) {
        return `${MONTH_LABELS[m - 1]} ${day}`;
      }
      return `${d.getUTCFullYear()}-${String(m).padStart(2, "0")}`;
    };

    for (let i = 1; i <= bucketCount; i++) {
      const bucketEnd = new Date(startMs + stepMs * i);
      const bucketEndMs = bucketEnd.getTime();
      const elapsedFraction = Math.min(1, Math.max(0, (bucketEndMs - startMs) / (endMs - startMs)));
      const ideal = Math.max(0, totalWork * (1 - elapsedFraction));

      let actual: number | null = null;
      if (bucketEndMs <= todayMs) {
        let completed = 0;
        for (const t of list) {
          const w = taskWeight(t, unit);
          if (w <= 0) continue;
          const isDone = t.status === "Completed" || Number(t.progress) >= 100;
          const doneDateStr = t.actualEndDate ?? (isDone ? t.endDate : null);
          const doneMs = doneDateStr ? new Date(doneDateStr).getTime() : NaN;
          if (isDone && Number.isFinite(doneMs) && doneMs <= bucketEndMs) {
            completed += w;
          } else if (bucketEndMs >= todayMs - stepMs && Number(t.progress) > 0 && !isDone) {
            // Partial credit at the "today" bucket only — keeps the
            // historical line monotonic instead of flickering with
            // in-progress tasks.
            completed += w * Math.min(1, Number(t.progress) / 100);
          }
        }
        actual = Math.max(0, totalWork - completed);
        asOfIndex = i - 1;
      }

      points.push({
        label: fmtLabel(bucketEnd),
        date: bucketEnd.toISOString().split("T")[0],
        ideal: Math.round(ideal * 10) / 10,
        actual: actual == null ? null : Math.round(actual * 10) / 10,
      });
    }

    out.push({
      projectId: pid,
      unit,
      totalWork: Math.round(totalWork * 10) / 10,
      windowStart: startStr,
      windowEnd: endStr,
      asOfIndex,
      points,
    });
  }

  return out;
}
