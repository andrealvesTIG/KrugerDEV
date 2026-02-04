import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useLocation } from "wouter";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, FileInput, Clock, CheckCircle2, XCircle, 
  TrendingUp, FileText, DollarSign
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { format, isWithinInterval, differenceInDays } from "date-fns";
import type { ProjectIntake } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Cyan: "#06b6d4",
  Gray: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  draft: COLORS.Gray,
  in_progress: COLORS.Blue,
  pending_review: COLORS.Yellow,
  approved: COLORS.Green,
  rejected: COLORS.Red,
  converted: COLORS.Purple,
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Converted",
};

export function IntakeDashboard() {
  const { currentOrganization } = useOrganization();
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());

  const { data: intakes = [], isLoading } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const filteredIntakes = useMemo(() => {
    return intakes.filter(intake => {
      if (filters.dateRange.from || filters.dateRange.to) {
        const createdDate = intake.createdAt ? new Date(intake.createdAt) : null;
        if (createdDate) {
          if (filters.dateRange.from && filters.dateRange.to) {
            if (!isWithinInterval(createdDate, { start: filters.dateRange.from, end: filters.dateRange.to })) {
              return false;
            }
          } else if (filters.dateRange.from && createdDate < filters.dateRange.from) {
            return false;
          } else if (filters.dateRange.to && createdDate > filters.dateRange.to) {
            return false;
          }
        }
      }
      return true;
    });
  }, [intakes, filters]);

  const handleExportCsv = () => {
    const headers = ["Name", "Status", "Funding Source", "Business Unit", "Est. Budget"];
    const rows = filteredIntakes.map(i => [
      i.projectName,
      STATUS_LABELS[i.status || "draft"] || i.status,
      i.fundingSource || "",
      i.businessUnit || "",
      i.estimatedBudget || "0",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "intake_dashboard.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const fundingDistribution = useMemo(() => {
    const funding: Record<string, number> = {};
    filteredIntakes.forEach(i => {
      const source = i.fundingSource || "Unspecified";
      funding[source] = (funding[source] || 0) + 1;
    });
    return Object.entries(funding).map(([name, value], idx) => ({
      name,
      value,
      color: [COLORS.Blue, COLORS.Green, COLORS.Purple, COLORS.Yellow, COLORS.Cyan][idx % 5],
    }));
  }, [filteredIntakes]);

  const monthlyTrend = useMemo(() => {
    const months: Record<string, { month: string; submitted: number; approved: number; rejected: number }> = {};
    filteredIntakes.forEach(intake => {
      if (!intake.createdAt) return;
      const monthKey = format(new Date(intake.createdAt), "MMM yyyy");
      if (!months[monthKey]) {
        months[monthKey] = { month: monthKey, submitted: 0, approved: 0, rejected: 0 };
      }
      months[monthKey].submitted++;
      if (intake.status === "approved" || intake.status === "converted") months[monthKey].approved++;
      if (intake.status === "rejected") months[monthKey].rejected++;
    });
    return Object.values(months).slice(-6);
  }, [filteredIntakes]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalIntakes = filteredIntakes.length;
  const draftIntakes = filteredIntakes.filter(i => i.status === "draft").length;
  const inProgressIntakes = filteredIntakes.filter(i => i.status === "in_progress" || i.status === "pending_review").length;
  const approvedIntakes = filteredIntakes.filter(i => i.status === "approved").length;
  const rejectedIntakes = filteredIntakes.filter(i => i.status === "rejected").length;
  const convertedIntakes = filteredIntakes.filter(i => i.status === "converted").length;
  const pmoApprovedIntakes = filteredIntakes.filter(i => i.pmoApproved).length;

  const conversionRate = totalIntakes > 0 ? Math.round(((approvedIntakes + convertedIntakes) / totalIntakes) * 100) : 0;

  const totalBudget = filteredIntakes.reduce((sum, i) => sum + Number(i.estimatedBudget || 0), 0);
  const avgProcessingTime = filteredIntakes.length > 0 
    ? Math.round(filteredIntakes.reduce((sum, i) => {
        if (!i.createdAt) return sum;
        const start = new Date(i.createdAt);
        const end = new Date();
        return sum + differenceInDays(end, start);
      }, 0) / filteredIntakes.length)
    : 0;

  const statusDistribution = [
    { name: "Draft", value: draftIntakes, color: STATUS_COLORS.draft },
    { name: "In Progress", value: inProgressIntakes, color: STATUS_COLORS.in_progress },
    { name: "Approved", value: approvedIntakes, color: STATUS_COLORS.approved },
    { name: "Rejected", value: rejectedIntakes, color: STATUS_COLORS.rejected },
    { name: "Converted", value: convertedIntakes, color: STATUS_COLORS.converted },
  ].filter(d => d.value > 0);

  const recentIntakes = [...filteredIntakes]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 8);

  const pendingReviewIntakes = filteredIntakes
    .filter(i => i.status === "in_progress" || i.status === "pending_review" || i.status === "draft")
    .sort((a, b) => Number(b.estimatedBudget || 0) - Number(a.estimatedBudget || 0))
    .slice(0, 8);

  const formatBudget = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Intake Pipeline</h2>
          <p className="text-sm text-muted-foreground">Track and manage project intake requests and approvals.</p>
        </div>
        <DashboardActionBar title="Intake Dashboard" dashboardType="intake" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <DashboardFilters
        filters={filters}
        onFiltersChange={setFilters}
        showPortfolio={false}
        showProject={false}
        showResource={false}
        showHealth={false}
        showPriority={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/intakes")} data-testid="kpi-total-intakes">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <FileInput className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Intakes</span>
          </div>
          <div className="text-2xl font-bold">{totalIntakes}</div>
          <div className="text-xs text-muted-foreground">{draftIntakes} drafts</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-pending">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">In Review</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{inProgressIntakes}</div>
          <div className="text-xs text-muted-foreground">awaiting decision</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-approved">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Approved</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{approvedIntakes}</div>
          <div className="text-xs text-muted-foreground">{convertedIntakes} converted</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-rejected">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Rejected</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{rejectedIntakes}</div>
          <div className="text-xs text-muted-foreground">{conversionRate}% approval rate</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-pmo-approved">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">PMO Approved</span>
          </div>
          <div className="text-2xl font-bold">{pmoApprovedIntakes}</div>
          <div className="text-xs text-muted-foreground">ready to convert</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-total-budget">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <DollarSign className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Est. Budget</span>
          </div>
          <div className="text-2xl font-bold">{formatBudget(totalBudget)}</div>
          <div className="text-xs text-muted-foreground">~{avgProcessingTime}d avg age</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="chart-status-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileInput className="h-4 w-4 text-muted-foreground" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-funding-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Funding Source
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fundingDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {fundingDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-monthly-trend">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Monthly Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="submitted" stackId="1" stroke={COLORS.Blue} fill={COLORS.Blue} fillOpacity={0.6} name="Submitted" />
                  <Area type="monotone" dataKey="approved" stackId="2" stroke={COLORS.Green} fill={COLORS.Green} fillOpacity={0.6} name="Approved" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-pending-review">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[220px]">
              {pendingReviewIntakes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-6 w-6 mr-2 text-emerald-500" />
                  No intakes pending review
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingReviewIntakes.map((intake) => (
                    <div 
                      key={intake.id} 
                      className="flex items-center gap-3 p-2 rounded-lg border hover-elevate cursor-pointer" 
                      onClick={() => setLocation(`/intakes/${intake.id}`)}
                      data-testid={`row-intake-${intake.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{intake.projectName}</div>
                        <div className="text-xs text-muted-foreground">{intake.businessUnit || intake.fundingSource || "No details"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs">
                          <div className="font-medium">{formatBudget(Number(intake.estimatedBudget || 0))}</div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className="text-[10px] h-5"
                          style={{ borderColor: STATUS_COLORS[intake.status || "draft"], color: STATUS_COLORS[intake.status || "draft"] }}
                        >
                          {STATUS_LABELS[intake.status || "draft"]}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-intakes">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Recent Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[220px]">
              {recentIntakes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  No recent intakes
                </div>
              ) : (
                <div className="space-y-2">
                  {recentIntakes.map((intake) => (
                    <div 
                      key={intake.id} 
                      className="flex items-center gap-3 p-2 rounded-lg border hover-elevate cursor-pointer" 
                      onClick={() => setLocation(`/intakes/${intake.id}`)}
                      data-testid={`row-recent-${intake.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{intake.projectName}</div>
                        <div className="text-xs text-muted-foreground">
                          {intake.createdAt ? format(new Date(intake.createdAt), "MMM d, yyyy") : "N/A"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs">
                          <div className="font-medium">{formatBudget(Number(intake.estimatedBudget || 0))}</div>
                        </div>
                        <Badge 
                          variant="secondary" 
                          className="text-[10px] h-5"
                          style={{ 
                            backgroundColor: `${STATUS_COLORS[intake.status || "draft"]}15`,
                            color: STATUS_COLORS[intake.status || "draft"]
                          }}
                        >
                          {STATUS_LABELS[intake.status || "draft"]}
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
