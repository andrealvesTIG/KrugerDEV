import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUserResource, useTeamTimesheetEntries, useTimesheetEntries } from "@/hooks/use-timesheets";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Clock,
  Target,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  TrendingUp,
  Calendar,
  Users,
  Eye,
  DollarSign,
  Hourglass,
  Briefcase,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
} from "recharts";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subWeeks,
  format,
  differenceInCalendarDays,
  isWeekend,
} from "date-fns";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
  Slate: "#64748b",
};

// ---- helpers ----
const parseHoursSafe = (hours: any): number => {
  const num = Number(hours ?? 0);
  if (!isFinite(num) || isNaN(num) || num < 0 || num > 24) return 0;
  return num;
};

const parseRate = (rate: any): number => {
  const num = Number(rate ?? 0);
  if (!isFinite(num) || isNaN(num) || num < 0) return 0;
  return num;
};

function workingDaysBetween(startDate: Date, endDate: Date): number {
  if (endDate < startDate) return 0;
  let count = 0;
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    if (!isWeekend(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

interface ResourceLite {
  id: number;
  weeklyCapacity?: string | number | null;
  availability?: number | null;
  costRate?: string | number | null;
  hourlyRate?: string | number | null;
  isBillable?: boolean | null;
}

function dailyExpectedHours(resource: ResourceLite): number {
  const weekly = parseRate(resource.weeklyCapacity ?? 40) || 40;
  const avail = ((resource.availability ?? 100) as number) / 100;
  return (weekly / 5) * avail;
}

function expectedHoursForResource(resource: ResourceLite, start: Date, end: Date): number {
  return workingDaysBetween(start, end) * dailyExpectedHours(resource);
}

function effectiveRate(resource: ResourceLite): number {
  return parseRate(resource.costRate) || parseRate(resource.hourlyRate) || 0;
}

export function TimesheetReportDashboard() {
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const { data: currentResource } = useCurrentUserResource(currentOrganization?.id ?? null, user?.id);
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());

  // ---- Permissions ----
  const isSuperAdmin = user?.role === "super_admin";
  const currentMembership = memberships.find(m => m.organizationId === currentOrganization?.id);
  const isOrgAdmin = currentMembership?.role === "org_admin" || currentMembership?.role === "owner";
  const isApprover = currentResource?.isApprover === true;
  const canViewTeam = isSuperAdmin || isOrgAdmin || isApprover;

  // ---- Date ranges ----
  const today = useMemo(() => new Date(), []);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  // Fetch a wider window so we can compute multi-week trends and approval turnaround accurately
  const fetchStart = subWeeks(startOfWeek(today, { weekStartsOn: 1 }), 7);
  const fetchEnd = monthEnd;
  const fetchStartStr = fetchStart.toISOString().split("T")[0];
  const fetchEndStr = fetchEnd.toISOString().split("T")[0];

  const { data: teamEntries = [], isLoading: teamLoading } = useTeamTimesheetEntries(
    canViewTeam ? (currentOrganization?.id ?? null) : null,
    fetchStartStr,
    fetchEndStr,
  );
  const { data: personalEntries = [], isLoading: personalLoading } = useTimesheetEntries(
    canViewTeam ? undefined : user?.id,
    canViewTeam ? null : (currentOrganization?.id ?? null),
    fetchStartStr,
    fetchEndStr,
  );
  const allEntries = canViewTeam ? teamEntries : personalEntries;
  const timesheetsLoading = canViewTeam ? teamLoading : personalLoading;

  // ---- Filtered resources & entries ----
  const filteredResources = useMemo(() => {
    return (resources ?? []).filter(r => {
      if (!r.isActive) return false;
      if (r.timesheetHidden) return false;
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      return true;
    });
  }, [resources, filters]);

  const projects = projectsData ?? [];

  const filteredAllEntries = useMemo(() => {
    const hiddenIds = new Set((resources ?? []).filter(r => r.timesheetHidden).map(r => r.id));
    return (allEntries ?? []).filter(e => {
      if (hiddenIds.has(e.resourceId)) return false;
      if (filters.resourceId && e.resourceId !== filters.resourceId) return false;
      if (filters.projectId && e.projectId !== filters.projectId) return false;
      if (filters.portfolioId !== null) {
        const project = projects.find(p => p.id === e.projectId);
        if (filters.portfolioId === -1) {
          if (!project || project.portfolioId) return false;
        } else {
          if (!project || project.portfolioId !== filters.portfolioId) return false;
        }
      }
      return true;
    });
  }, [allEntries, filters, projects, resources]);

  // Entries inside the current month (for KPIs/charts that say "this month")
  const monthEntries = useMemo(() => {
    return filteredAllEntries.filter(e => {
      const d = new Date(e.entryDate);
      return d >= monthStart && d <= monthEnd;
    });
  }, [filteredAllEntries, monthStart, monthEnd]);

  if (resourcesLoading || timesheetsLoading || projectsLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = filteredResources;
  const resourceById = new Map(activeResources.map(r => [r.id, r]));

  // ---- Capacity / Expected hours ----
  // "To-date" expected: working days from month start through today (or month end, whichever earlier)
  const toDateEnd = today < monthEnd ? today : monthEnd;
  const totalExpectedToDate = activeResources.reduce(
    (sum, r) => sum + expectedHoursForResource(r as ResourceLite, monthStart, toDateEnd),
    0,
  );
  const totalExpectedFullMonth = activeResources.reduce(
    (sum, r) => sum + expectedHoursForResource(r as ResourceLite, monthStart, monthEnd),
    0,
  );

  // ---- Core totals (this month) ----
  const totalLoggedHours = monthEntries.reduce((s, e) => s + parseHoursSafe(e.hours), 0);

  // Compliance: vs expected to-date (so unfinished month doesn't unfairly drag it down)
  const complianceRate = totalExpectedToDate > 0
    ? Math.round((totalLoggedHours / totalExpectedToDate) * 100)
    : 0;

  // Approval pipeline
  const draftEntries = monthEntries.filter(e => e.status === "Draft");
  const submittedEntries = monthEntries.filter(e => e.status === "Submitted");
  const approvedEntries = monthEntries.filter(e => e.status === "Approved");
  const rejectedEntries = monthEntries.filter(e => e.status === "Rejected");
  const reviewedEntries = approvedEntries.length + rejectedEntries.length;
  const approvalRate = reviewedEntries > 0
    ? Math.round((approvedEntries.length / reviewedEntries) * 100)
    : 0;

  // Pending approval (Submitted, awaiting decision) — across whole fetch window
  const pendingApprovalAll = filteredAllEntries.filter(e => e.status === "Submitted");
  const oldestPending = pendingApprovalAll.reduce<number>((max, e) => {
    const ref = e.submittedAt ? new Date(e.submittedAt) : new Date(e.entryDate);
    const days = differenceInCalendarDays(today, ref);
    return days > max ? days : max;
  }, 0);

  // Avg approval turnaround (days submittedAt → approvedAt)
  const turnaroundSamples = filteredAllEntries
    .filter(e => e.status === "Approved" && e.submittedAt && e.approvedAt)
    .map(e => differenceInCalendarDays(new Date(e.approvedAt as any), new Date(e.submittedAt as any)))
    .filter(d => d >= 0);
  const avgTurnaround = turnaroundSamples.length > 0
    ? Math.round((turnaroundSamples.reduce((a, b) => a + b, 0) / turnaroundSamples.length) * 10) / 10
    : null;

  // Billable mix
  const billableHours = monthEntries.reduce((s, e) => {
    const r = resourceById.get(e.resourceId);
    return r && r.isBillable !== false ? s + parseHoursSafe(e.hours) : s;
  }, 0);
  const nonBillableHours = totalLoggedHours - billableHours;
  const billablePct = totalLoggedHours > 0 ? Math.round((billableHours / totalLoggedHours) * 100) : 0;

  // Estimated cost (this month)
  const estCost = monthEntries.reduce((s, e) => {
    const r = resourceById.get(e.resourceId);
    if (!r) return s;
    return s + parseHoursSafe(e.hours) * effectiveRate(r as ResourceLite);
  }, 0);

  // Active trackers — resources that logged any time this month
  const activeTrackerIds = new Set(monthEntries.map(e => e.resourceId));
  const activeTrackerCount = activeTrackerIds.size;
  const trackerRate = activeResources.length > 0
    ? Math.round((activeTrackerCount / activeResources.length) * 100)
    : 0;

  // ---- Per-resource roll-up ----
  const resourceStats = activeResources.map(r => {
    const rEntries = monthEntries.filter(e => e.resourceId === r.id);
    const hours = rEntries.reduce((s, e) => s + parseHoursSafe(e.hours), 0);
    const expected = expectedHoursForResource(r as ResourceLite, monthStart, toDateEnd);
    const compliance = expected > 0 ? Math.round((hours / expected) * 100) : 0;
    const lastEntryDate = rEntries.reduce<Date | null>((latest, e) => {
      const d = new Date(e.entryDate);
      return !latest || d > latest ? d : latest;
    }, null);
    return {
      id: r.id,
      name: r.displayName,
      department: r.department,
      hours: Math.round(hours * 10) / 10,
      expected: Math.round(expected * 10) / 10,
      compliance,
      entryCount: rEntries.length,
      lastEntryDate,
      pendingCount: rEntries.filter(e => e.status === "Submitted").length,
    };
  });

  const topContributors = [...resourceStats]
    .filter(r => r.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  const atRiskResources = resourceStats
    .filter(r => r.compliance < 70)
    .sort((a, b) => a.compliance - b.compliance)
    .slice(0, 12);

  // ---- 6-week trend ----
  const weeklyTrend = Array.from({ length: 6 }, (_, i) => {
    const wkStart = startOfWeek(subWeeks(today, 5 - i), { weekStartsOn: 1 });
    const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
    const effectiveEnd = wkEnd < today ? wkEnd : today;
    const weekEntries = filteredAllEntries.filter(e => {
      const d = new Date(e.entryDate);
      return d >= wkStart && d <= wkEnd;
    });
    const logged = weekEntries.reduce((s, e) => s + parseHoursSafe(e.hours), 0);
    const target = activeResources.reduce(
      (s, r) => s + expectedHoursForResource(r as ResourceLite, wkStart, wkEnd),
      0,
    );
    const targetToDate = activeResources.reduce(
      (s, r) => s + expectedHoursForResource(r as ResourceLite, wkStart, effectiveEnd),
      0,
    );
    return {
      week: format(wkStart, "MMM d"),
      logged: Math.round(logged),
      target: Math.round(target),
      targetToDate: Math.round(targetToDate),
    };
  });

  // Week-over-week change (using completed prior week vs running current week)
  const thisWeek = weeklyTrend[weeklyTrend.length - 1];
  const lastWeek = weeklyTrend[weeklyTrend.length - 2];
  const wowChange = lastWeek && lastWeek.logged > 0
    ? Math.round(((thisWeek.logged - lastWeek.logged) / lastWeek.logged) * 100)
    : 0;

  // ---- Status pipeline ----
  const statusPipeline = [
    { name: "Draft", value: draftEntries.length, color: COLORS.Slate },
    { name: "Submitted", value: submittedEntries.length, color: COLORS.Blue },
    { name: "Approved", value: approvedEntries.length, color: COLORS.Green },
    { name: "Rejected", value: rejectedEntries.length, color: COLORS.Red },
  ].filter(d => d.value > 0);

  // ---- Top projects ----
  const projectAgg = new Map<number, { id: number; name: string; portfolio: string; hours: number; resources: Set<number> }>();
  monthEntries.forEach(e => {
    const proj = projects.find(p => p.id === e.projectId);
    const cur = projectAgg.get(e.projectId) || {
      id: e.projectId,
      name: proj?.name || `Project ${e.projectId}`,
      portfolio: portfolios?.find(pf => pf.id === proj?.portfolioId)?.name || "No Portfolio",
      hours: 0,
      resources: new Set<number>(),
    };
    cur.hours += parseHoursSafe(e.hours);
    cur.resources.add(e.resourceId);
    projectAgg.set(e.projectId, cur);
  });
  const topProjects = Array.from(projectAgg.values())
    .map(p => ({ ...p, hours: Math.round(p.hours * 10) / 10, resourceCount: p.resources.size }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  // ---- Export ----
  const handleExportCsv = () => {
    const headers = ["Resource", "Department", "Logged Hours", "Expected (to date)", "Compliance %", "Entries", "Pending"];
    const rows = resourceStats.map(r => [
      r.name,
      r.department || "",
      r.hours,
      r.expected,
      r.compliance,
      r.entryCount,
      r.pendingCount,
    ]);
    const csv = [headers.join(","), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timesheet_overview_${format(today, "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  const complianceColor = (c: number) => (c >= 90 ? COLORS.Green : c >= 70 ? COLORS.Yellow : COLORS.Red);
  const formatCurrency = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Timesheet Overview</h2>
            <p className="text-sm text-muted-foreground">
              {format(monthStart, "MMM d")} – {format(monthEnd, "MMM d, yyyy")} • Capacity-based KPIs from logged entries
            </p>
          </div>
          <Badge variant="outline" className="flex items-center gap-1.5 h-6" data-testid="badge-view-scope">
            <Eye className="h-3 w-3" />
            {canViewTeam ? "Team View" : "Personal View"}
          </Badge>
        </div>
        <DashboardActionBar
          title="Timesheet Overview Dashboard"
          dashboardType="timesheet"
          organizationId={currentOrganization?.id || 0}
          onExportCsv={handleExportCsv}
        />
      </div>

      <DashboardFilters
        portfolios={portfolios || []}
        projects={filters.portfolioId !== null
          ? (projectsData || []).filter(p => filters.portfolioId === -1 ? !p.portfolioId : p.portfolioId === filters.portfolioId)
          : (projectsData || [])}
        resources={resources || []}
        filters={filters}
        onFiltersChange={setFilters}
        showHealth={false}
        showPriority={false}
      />

      {/* ---- KPI ROW ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-logged-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Logged</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(totalLoggedHours)}h</div>
          <div className="text-[11px] text-muted-foreground">
            of {Math.round(totalExpectedFullMonth)}h plan
          </div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-compliance">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${complianceColor(complianceRate)}15` }}>
              <Target className="h-3.5 w-3.5" style={{ color: complianceColor(complianceRate) }} />
            </div>
            <span className="text-xs text-muted-foreground">Compliance</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: complianceColor(complianceRate) }}>
            {complianceRate}%
          </div>
          <div className="text-[11px] text-muted-foreground">vs {Math.round(totalExpectedToDate)}h to-date</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-billable">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Billable</span>
          </div>
          <div className="text-2xl font-bold">{billablePct}%</div>
          <div className="text-[11px] text-muted-foreground">
            {Math.round(billableHours)}h / {Math.round(nonBillableHours)}h non-bill
          </div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-cost">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-violet-500/10">
              <DollarSign className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <span className="text-xs text-muted-foreground">Est. Cost</span>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(estCost)}</div>
          <div className="text-[11px] text-muted-foreground">labor this month</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-approval">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-green-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <span className="text-xs text-muted-foreground">Approval Rate</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{approvalRate}%</div>
          <div className="text-[11px] text-muted-foreground">
            {approvedEntries.length} ok / {rejectedEntries.length} rej
          </div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-pending">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Hourglass className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{pendingApprovalAll.length}</div>
          <div className="text-[11px] text-muted-foreground">
            {avgTurnaround !== null ? `${avgTurnaround}d avg turnaround` : oldestPending > 0 ? `oldest ${oldestPending}d` : "no backlog"}
          </div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-trackers">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <Activity className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Active Trackers</span>
          </div>
          <div className="text-2xl font-bold">{activeTrackerCount}<span className="text-sm text-muted-foreground">/{activeResources.length}</span></div>
          <div className="text-[11px] text-muted-foreground">{trackerRate}% logged this month</div>
        </Card>
      </div>

      {/* ---- TREND + PIPELINE ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="chart-weekly-hours">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              6-Week Hours vs Capacity
              <Badge variant="outline" className="ml-2 text-[10px] h-5">
                WoW {wowChange >= 0 ? "+" : ""}{wowChange}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 2px 8px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v}h`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="logged" fill={COLORS.Blue} radius={[4, 4, 0, 0]} name="Logged" />
                  <Line type="monotone" dataKey="target" stroke={COLORS.Green} strokeWidth={2} dot={false} name="Full-Week Capacity" />
                  <Line type="monotone" dataKey="targetToDate" stroke={COLORS.Yellow} strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="Capacity-to-Date" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-status-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              Approval Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {statusPipeline.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
                No entries this month
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPipeline}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusPipeline.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 2px 8px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                      formatter={(v: number, name: string) => [`${v} entries`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- TOP PROJECTS ---- */}
      <Card data-testid="chart-top-projects">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            Top Projects by Hours (this month)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {topProjects.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">
              No project hours this month
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProjects} layout="vertical" margin={{ left: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={85}
                    tickFormatter={(v: string) => (v.length > 18 ? v.substring(0, 18) + "…" : v)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 2px 8px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                    formatter={(v: number, _n, p: any) => [`${v}h • ${p.payload.resourceCount} resources`, p.payload.portfolio]}
                  />
                  <Bar dataKey="hours" fill={COLORS.Purple} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- CONTRIBUTORS + AT RISK ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-top-contributors">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Top Contributors
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[260px]">
              <div className="space-y-2">
                {topContributors.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">No hours logged yet this month</div>
                )}
                {topContributors.map(r => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-2 rounded-lg border hover-elevate"
                    data-testid={`row-contributor-${r.id}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(r.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.department || "No department"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs font-medium">{r.hours}h</div>
                        <div className="text-[10px] text-muted-foreground">of {r.expected}h</div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-5 min-w-[44px] justify-center"
                        style={{ backgroundColor: `${complianceColor(r.compliance)}15`, color: complianceColor(r.compliance) }}
                      >
                        {r.compliance}%
                      </Badge>
                      <div className="w-12">
                        <Progress value={Math.min(100, r.compliance)} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card data-testid="card-at-risk">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Below Pace (under 70% to-date)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[260px]">
              {atRiskResources.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm py-12">
                  <CheckCircle2 className="h-6 w-6 mr-2 text-emerald-500" />
                  Everyone is on pace
                </div>
              ) : (
                <div className="space-y-2">
                  {atRiskResources.map(r => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-2 rounded-lg border hover-elevate"
                      data-testid={`row-at-risk-${r.id}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{getInitials(r.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.department || "No department"}
                          {r.lastEntryDate && (
                            <span> • last {format(r.lastEntryDate, "MMM d")}</span>
                          )}
                          {!r.lastEntryDate && <span> • no entries</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs">
                          <span className="font-medium">{r.hours}h</span>
                          <span className="text-muted-foreground"> / {r.expected}h</span>
                        </div>
                        <Badge
                          variant={r.compliance >= 50 ? "secondary" : "destructive"}
                          className="text-[10px] h-5 min-w-[44px] justify-center"
                        >
                          {r.compliance}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
