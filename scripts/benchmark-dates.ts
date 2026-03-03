import { performance } from "perf_hooks";

function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function workingDaysBetween(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    if (isWorkingDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function workingDaysBetweenOptimized(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let workingDays = fullWeeks * 5;
  const remainder = totalDays % 7;
  const startDay = startDate.getDay();
  for (let i = 0; i < remainder; i++) {
    const day = (startDay + fullWeeks * 7 + i) % 7;
    if (day !== 0 && day !== 6) workingDays++;
  }
  return workingDays;
}

interface SyntheticTask {
  id: number;
  projectId: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  priority: string;
  progress: number;
  createdAt: Date;
}

function randomDate(minYear: number, maxYear: number): Date {
  const start = new Date(minYear, 0, 1).getTime();
  const end = new Date(maxYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateTasks(n: number): SyntheticTask[] {
  const statuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
  const priorities = ["Low", "Medium", "High", "Critical"];
  const tasks: SyntheticTask[] = [];
  for (let i = 0; i < n; i++) {
    const start = randomDate(2024, 2026);
    const durationMs = (Math.floor(Math.random() * 180) + 1) * 86400000;
    const end = new Date(start.getTime() + durationMs);
    tasks.push({
      id: i + 1,
      projectId: Math.floor(Math.random() * 50) + 1,
      name: `Task-${i + 1}`,
      startDate: formatDate(start),
      endDate: formatDate(end),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      progress: Math.floor(Math.random() * 101),
      createdAt: new Date(start.getTime() - Math.random() * 30 * 86400000),
    });
  }
  return tasks;
}

function measure(label: string, fn: () => void, iterations: number = 1): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

function runFilterBenchmark(tasks: SyntheticTask[]): {
  filterByDateRange: number;
  filterOverdue: number;
  sortByStartDate: number;
  sortByEndDate: number;
  sortByCreatedAt: number;
  paginate: number;
  filterSortPage: number;
} {
  const today = formatDate(new Date());
  const sixMonthsAgo = formatDate(new Date(Date.now() - 180 * 86400000));

  const filterByDateRange = measure("filterByDateRange", () => {
    tasks.filter(
      (t) => t.startDate >= sixMonthsAgo && t.startDate <= today
    );
  }, 3);

  const filterOverdue = measure("filterOverdue", () => {
    tasks.filter(
      (t) => t.endDate < today && t.status !== "Completed" && t.status !== "Cancelled"
    );
  }, 3);

  const sortByStartDate = measure("sortByStartDate", () => {
    [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, 3);

  const sortByEndDate = measure("sortByEndDate", () => {
    [...tasks].sort((a, b) => a.endDate.localeCompare(b.endDate));
  }, 3);

  const sortByCreatedAt = measure("sortByCreatedAt", () => {
    [...tasks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, 3);

  const paginate = measure("paginate", () => {
    const sorted = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    sorted.slice(0, 50);
  }, 3);

  const filterSortPage = measure("filterSortPage", () => {
    const filtered = tasks.filter(
      (t) => t.startDate >= sixMonthsAgo && t.startDate <= today
    );
    const sorted = filtered.sort((a, b) => a.startDate.localeCompare(b.startDate));
    sorted.slice(0, 50);
  }, 3);

  return { filterByDateRange, filterOverdue, sortByStartDate, sortByEndDate, sortByCreatedAt, paginate, filterSortPage };
}

function runWorkingDaysBenchmark(tasks: SyntheticTask[]): {
  loopImpl: number;
  optimizedImpl: number;
  perTaskLoop: number;
  perTaskOptimized: number;
} {
  const subset = tasks.slice(0, Math.min(tasks.length, 10000));

  const loopImpl = measure("workingDaysBetween (loop)", () => {
    for (const t of subset) {
      workingDaysBetween(new Date(t.startDate), new Date(t.endDate));
    }
  });

  const optimizedImpl = measure("workingDaysBetween (optimized)", () => {
    for (const t of subset) {
      workingDaysBetweenOptimized(new Date(t.startDate), new Date(t.endDate));
    }
  });

  return {
    loopImpl,
    optimizedImpl,
    perTaskLoop: loopImpl / subset.length,
    perTaskOptimized: optimizedImpl / subset.length,
  };
}

function runDateParsingBenchmark(tasks: SyntheticTask[]): {
  parseISOPerRender: number;
  cachedParsePerRender: number;
} {
  const subset = tasks.slice(0, Math.min(tasks.length, 5000));

  const parseISOPerRender = measure("parseISO per render", () => {
    for (const t of subset) {
      new Date(t.startDate);
      new Date(t.endDate);
    }
  }, 5);

  const cachedParsePerRender = measure("cached parse per render", () => {
    const cache = new Map<string, Date>();
    for (const t of subset) {
      if (!cache.has(t.startDate)) cache.set(t.startDate, new Date(t.startDate));
      if (!cache.has(t.endDate)) cache.set(t.endDate, new Date(t.endDate));
    }
  }, 5);

  return { parseISOPerRender, cachedParsePerRender };
}

function simulateServerSideFiltering(tasks: SyntheticTask[]): {
  sqlWhereSimulation: number;
  sqlSortSimulation: number;
  sqlLimitOffset: number;
} {
  const today = formatDate(new Date());
  const sixMonthsAgo = formatDate(new Date(Date.now() - 180 * 86400000));

  const sqlWhereSimulation = measure("SQL WHERE simulation", () => {
    const result: SyntheticTask[] = [];
    for (const t of tasks) {
      if (t.startDate >= sixMonthsAgo && t.endDate <= today && t.status !== "Completed") {
        result.push(t);
      }
    }
  }, 3);

  const sqlSortSimulation = measure("SQL ORDER BY simulation", () => {
    const filtered = tasks.filter(
      (t) => t.startDate >= sixMonthsAgo && t.endDate <= today
    );
    filtered.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, 3);

  const sqlLimitOffset = measure("SQL LIMIT/OFFSET simulation", () => {
    const filtered = tasks.filter(
      (t) => t.startDate >= sixMonthsAgo && t.endDate <= today
    );
    filtered.sort((a, b) => a.startDate.localeCompare(b.startDate));
    filtered.slice(100, 150);
  }, 3);

  return { sqlWhereSimulation, sqlSortSimulation, sqlLimitOffset };
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function padNum(n: number, len: number, decimals: number = 3): string {
  return n.toFixed(decimals).padStart(len);
}

function printTable(headers: string[], rows: string[][], colWidths: number[]) {
  const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join(" | ");
  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((c, i) => pad(c, colWidths[i])).join(" | "));
  }
}

function main() {
  const sizes = [1_000, 10_000, 100_000];

  console.log("=".repeat(80));
  console.log("  PERFORMANCE BENCHMARK HARNESS — Date/Schedule Operations");
  console.log("=".repeat(80));
  console.log();

  const allResults: Record<number, {
    filter: ReturnType<typeof runFilterBenchmark>;
    working: ReturnType<typeof runWorkingDaysBenchmark>;
    parsing: ReturnType<typeof runDateParsingBenchmark>;
    server: ReturnType<typeof simulateServerSideFiltering>;
    genTime: number;
  }> = {};

  for (const n of sizes) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`  Generating ${n.toLocaleString()} synthetic tasks...`);
    const genStart = performance.now();
    const tasks = generateTasks(n);
    const genTime = performance.now() - genStart;
    console.log(`  Generated in ${genTime.toFixed(1)}ms`);
    console.log(`${"─".repeat(80)}`);

    console.log(`\n  [1] Client-Side Filtering & Sorting (N=${n.toLocaleString()})`);
    const filterResults = runFilterBenchmark(tasks);
    printTable(
      ["Operation", "Time (ms)"],
      [
        ["Filter by date range", padNum(filterResults.filterByDateRange, 12)],
        ["Filter overdue tasks", padNum(filterResults.filterOverdue, 12)],
        ["Sort by startDate", padNum(filterResults.sortByStartDate, 12)],
        ["Sort by endDate", padNum(filterResults.sortByEndDate, 12)],
        ["Sort by createdAt", padNum(filterResults.sortByCreatedAt, 12)],
        ["Paginate (first 50)", padNum(filterResults.paginate, 12)],
        ["Filter+Sort+Page combined", padNum(filterResults.filterSortPage, 12)],
      ],
      [30, 12]
    );

    console.log(`\n  [2] Working Days Calculation (N=${Math.min(n, 10000).toLocaleString()} tasks)`);
    const workingResults = runWorkingDaysBenchmark(tasks);
    printTable(
      ["Implementation", "Total (ms)", "Per Task (ms)"],
      [
        ["Loop (current)", padNum(workingResults.loopImpl, 12), padNum(workingResults.perTaskLoop, 12, 6)],
        ["Math (optimized)", padNum(workingResults.optimizedImpl, 12), padNum(workingResults.perTaskOptimized, 12, 6)],
      ],
      [20, 12, 14]
    );
    const speedup = workingResults.loopImpl / workingResults.optimizedImpl;
    console.log(`  → Optimized is ${speedup.toFixed(1)}x faster`);

    console.log(`\n  [3] Date Parsing Overhead (N=${Math.min(n, 5000).toLocaleString()} tasks)`);
    const parsingResults = runDateParsingBenchmark(tasks);
    printTable(
      ["Approach", "Time (ms)"],
      [
        ["parseISO each render", padNum(parsingResults.parseISOPerRender, 12)],
        ["Cached parse (Map)", padNum(parsingResults.cachedParsePerRender, 12)],
      ],
      [25, 12]
    );

    console.log(`\n  [4] Server-Side Filtering Simulation (N=${n.toLocaleString()})`);
    const serverResults = simulateServerSideFiltering(tasks);
    printTable(
      ["Operation", "Time (ms)"],
      [
        ["WHERE clause filter", padNum(serverResults.sqlWhereSimulation, 12)],
        ["WHERE + ORDER BY", padNum(serverResults.sqlSortSimulation, 12)],
        ["WHERE + ORDER BY + LIMIT", padNum(serverResults.sqlLimitOffset, 12)],
      ],
      [30, 12]
    );

    allResults[n] = { filter: filterResults, working: workingResults, parsing: parsingResults, server: serverResults, genTime };
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("  SUMMARY: Scaling Comparison Across N");
  console.log(`${"=".repeat(80)}\n`);

  printTable(
    ["Metric", "1K (ms)", "10K (ms)", "100K (ms)", "Scaling"],
    [
      [
        "Filter by date range",
        padNum(allResults[1000].filter.filterByDateRange, 10),
        padNum(allResults[10000].filter.filterByDateRange, 10),
        padNum(allResults[100000].filter.filterByDateRange, 10),
        "O(N)",
      ],
      [
        "Sort by startDate",
        padNum(allResults[1000].filter.sortByStartDate, 10),
        padNum(allResults[10000].filter.sortByStartDate, 10),
        padNum(allResults[100000].filter.sortByStartDate, 10),
        "O(N log N)",
      ],
      [
        "Filter+Sort+Page",
        padNum(allResults[1000].filter.filterSortPage, 10),
        padNum(allResults[10000].filter.filterSortPage, 10),
        padNum(allResults[100000].filter.filterSortPage, 10),
        "O(N log N)",
      ],
      [
        "Working days (loop)",
        padNum(allResults[1000].working.loopImpl, 10),
        padNum(allResults[10000].working.loopImpl, 10),
        padNum(allResults[100000].working.loopImpl, 10),
        "O(N × D)",
      ],
      [
        "Working days (math)",
        padNum(allResults[1000].working.optimizedImpl, 10),
        padNum(allResults[10000].working.optimizedImpl, 10),
        padNum(allResults[100000].working.optimizedImpl, 10),
        "O(N)",
      ],
      [
        "Server filter sim",
        padNum(allResults[1000].server.sqlLimitOffset, 10),
        padNum(allResults[10000].server.sqlLimitOffset, 10),
        padNum(allResults[100000].server.sqlLimitOffset, 10),
        "O(N log N)",
      ],
    ],
    [22, 10, 10, 10, 12]
  );

  console.log(`\n${"=".repeat(80)}`);
  console.log("  COMPLEXITY ANALYSIS");
  console.log(`${"=".repeat(80)}\n`);

  printTable(
    ["Operation", "Current", "Optimized", "Notes"],
    [
      ["Client filter (all tasks)", "O(N)", "O(1) with SQL", "Move to server-side WHERE clause"],
      ["Client sort (all tasks)", "O(N log N)", "O(1) with SQL", "Move to server-side ORDER BY"],
      ["Client paginate", "O(N)", "O(1) with SQL", "Use LIMIT/OFFSET server-side"],
      ["workingDaysBetween", "O(D) per task", "O(1) per task", "Replace loop with arithmetic formula"],
      ["parseISO per render", "O(N) per render", "O(N) once", "Memoize with useMemo + Map cache"],
      ["Multi-org task fetch", "O(Orgs × 2)", "O(2) total", "Batch query with inArray()"],
      ["Gantt date parsing", "O(N) per render", "O(N) once", "Pre-compute date map in useMemo"],
      ["Duration calc per row", "O(N × D)", "O(N) once", "Pre-compute with memoized map"],
    ],
    [28, 18, 18, 46]
  );

  console.log(`\n${"=".repeat(80)}`);
  console.log("  HOTSPOT IDENTIFICATION");
  console.log(`${"=".repeat(80)}\n`);

  const hotspots = [
    {
      rank: 1,
      area: "workingDaysBetween loop",
      file: "server/lib/workingDays.ts:23-37, client/src/lib/workingDays.ts:24-38",
      impact: "O(D) per call — iterates every calendar day between dates",
      fix: "Replace with O(1) arithmetic: fullWeeks*5 + remainder weekdays",
    },
    {
      rank: 2,
      area: "Client-side full-dataset sort",
      file: "client/src/pages/Tasks.tsx",
      impact: "O(N log N) on every render for large task lists",
      fix: "Server-side ORDER BY with indexed columns",
    },
    {
      rank: 3,
      area: "Multi-org N+1 queries",
      file: "server/routes.ts (line ~9712)",
      impact: "2×N database round-trips for N organizations",
      fix: "Single batched query with inArray()",
    },
    {
      rank: 4,
      area: "Per-row parseISO in Gantt",
      file: "client/src/components/project/ProjectGanttView.tsx",
      impact: "Creates 2×N Date objects per render cycle",
      fix: "Memoize parsed dates with useMemo Map",
    },
    {
      rank: 5,
      area: "No server-side date filtering",
      file: "server/routes.ts GET /api/tasks",
      impact: "Transfers all tasks to client, filters in JS",
      fix: "Add SQL WHERE clauses for date range params",
    },
  ];

  for (const h of hotspots) {
    console.log(`  #${h.rank}: ${h.area}`);
    console.log(`     File: ${h.file}`);
    console.log(`     Impact: ${h.impact}`);
    console.log(`     Fix: ${h.fix}`);
    console.log();
  }

  console.log("=".repeat(80));
  console.log("  Benchmark complete.");
  console.log("=".repeat(80));
}

main();
