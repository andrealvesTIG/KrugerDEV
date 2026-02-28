import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useQuery } from "@tanstack/react-query";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Loader2, AlertTriangle, ShieldAlert, CheckCircle2, AlertCircle, Bug, ArrowRight, Target, Activity } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend, ScatterChart, Scatter, ZAxis } from "recharts";
import type { Risk, Issue, Project } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Orange: "#f97316",
  Cyan: "#06b6d4",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: COLORS.Red,
  High: COLORS.Orange,
  Medium: COLORS.Yellow,
  Low: COLORS.Blue,
};

export function RisksIssuesDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());

  const { data: allRisksData = [], isLoading: risksLoading } = useQuery<Risk[]>({
    queryKey: ['/api/risks/all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/risks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: allIssues = [], isLoading: issuesLoading } = useQuery<Issue[]>({
    queryKey: ['/api/issues/all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/issues?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = useMemo(() => {
    return (projectsData ?? []).filter(p => {
      if (filters.portfolioId === -1 && p.portfolioId) return false;
      if (filters.portfolioId !== null && filters.portfolioId !== -1 && p.portfolioId !== filters.portfolioId) return false;
      if (filters.projectId && p.id !== filters.projectId) return false;
      if (filters.health && p.health !== filters.health) return false;
      return true;
    });
  }, [projectsData, filters]);

  const filteredProjectIds = useMemo(() => new Set(projects.map(p => p.id)), [projects]);

  const allRisks = useMemo(() => {
    return allRisksData.filter(r => {
      if (filters.projectId && r.projectId !== filters.projectId) return false;
      if (filters.portfolioId !== null && !filteredProjectIds.has(r.projectId)) return false;
      if (filters.priority && r.impact !== filters.priority) return false;
      return true;
    });
  }, [allRisksData, filters, filteredProjectIds]);

  const filteredIssues = useMemo(() => {
    return allIssues.filter(i => {
      // Only include actual issues (not risks) - itemType is null or 'issue' for regular issues
      if (i.itemType === 'risk') return false;
      if (filters.projectId && i.projectId !== filters.projectId) return false;
      if (filters.portfolioId !== null && !filteredProjectIds.has(i.projectId)) return false;
      if (filters.priority && i.priority !== filters.priority) return false;
      return true;
    });
  }, [allIssues, filters, filteredProjectIds]);

  if (projectsLoading || risksLoading || issuesLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleExportCsv = () => {
    const headers = ["Type", "Title", "Status", "Priority/Impact", "Project", "Due Date", "Cost Exposure"];
    const riskRows = allRisks.map(r => ["Risk", r.title, r.status, r.impact, getProjectName(r.projectId), r.dueDate || "", r.costExposure || ""]);
    const issueRows = filteredIssues.map(i => ["Issue", i.title, i.status, i.priority, getProjectName(i.projectId), "", ""]);
    const csv = [headers.join(","), ...riskRows.map(r => r.join(",")), ...issueRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "risks_issues_dashboard.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const getProjectName = (projectId: number) => {
    const project = projectsData?.find(p => p.id === projectId);
    return project?.name || "Unknown";
  };

  const openRisks = allRisks.filter(r => r.status === "Open" || r.status === "Identified").length;
  const mitigatedRisks = allRisks.filter(r => r.status === "Mitigated").length;
  const closedRisks = allRisks.filter(r => r.status === "Closed").length;
  const highRisks = allRisks.filter(r => r.probability === "High" || r.impact === "High").length;

  const openIssues = filteredIssues.filter(i => i.status === "Open" || i.status === "In Progress").length;
  const resolvedIssues = filteredIssues.filter(i => i.status === "Resolved" || i.status === "Closed").length;
  const criticalIssues = filteredIssues.filter(i => i.priority === "Critical").length;
  const highIssues = filteredIssues.filter(i => i.priority === "High").length;

  const riskStatusData = [
    { name: "Open", value: openRisks, color: COLORS.Red },
    { name: "Mitigated", value: mitigatedRisks, color: COLORS.Yellow },
    { name: "Closed", value: closedRisks, color: COLORS.Green },
  ].filter(d => d.value > 0);

  const issuesByPriority = [
    { name: "Critical", value: filteredIssues.filter(i => i.priority === "Critical").length, color: COLORS.Red },
    { name: "High", value: filteredIssues.filter(i => i.priority === "High").length, color: COLORS.Orange },
    { name: "Medium", value: filteredIssues.filter(i => i.priority === "Medium").length, color: COLORS.Yellow },
    { name: "Low", value: filteredIssues.filter(i => i.priority === "Low").length, color: COLORS.Blue },
  ];

  const probabilityMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  const impactMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  
  const riskHeatmapData = allRisks
    .filter(r => r.status === "Open" || r.status === "Identified")
    .reduce((acc, risk) => {
      const prob = probabilityMap[risk.probability || "Medium"] || 2;
      const impact = impactMap[risk.impact || "Medium"] || 2;
      const key = `${prob}-${impact}`;
      const existing = acc.find(d => d.key === key);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ probability: prob, impact: impact, count: 1, key });
      }
      return acc;
    }, [] as { probability: number; impact: number; count: number; key: string }[]);

  const topBlockers = [
    ...allRisks
      .filter(r => (r.status === "Open" || r.status === "Identified") && (r.probability === "High" || r.impact === "High"))
      .map(r => ({ id: r.id, title: r.title, type: "Risk" as const, severity: r.impact || "Medium", projectId: r.projectId, costExposure: r.costExposure })),
    ...filteredIssues
      .filter(i => (i.status === "Open" || i.status === "In Progress") && (i.priority === "Critical" || i.priority === "High"))
      .map(i => ({ id: i.id, title: i.title, type: "Issue" as const, severity: i.priority || "Medium", projectId: i.projectId, costExposure: null as string | null })),
  ].slice(0, 12);

  const projectRiskCounts = (projects || []).map(p => ({
    id: p.id,
    name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
    fullName: p.name,
    risks: allRisks.filter(r => r.projectId === p.id && (r.status === "Open" || r.status === "Identified")).length,
    issues: filteredIssues.filter(i => i.projectId === p.id && (i.status === "Open" || i.status === "In Progress")).length,
  })).filter(p => p.risks > 0 || p.issues > 0).sort((a, b) => (b.risks + b.issues) - (a.risks + a.issues)).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Risks & Issues</h2>
          <p className="text-sm text-muted-foreground">Monitor and track project risks and issues across portfolios.</p>
        </div>
        <DashboardActionBar title="Risks & Issues Dashboard" dashboardType="risks-issues" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <DashboardFilters
        portfolios={portfolios || []}
        projects={filters.portfolioId !== null
          ? (projectsData || []).filter(p => filters.portfolioId === -1 ? !p.portfolioId : p.portfolioId === filters.portfolioId) 
          : (projectsData || [])}
        filters={filters}
        onFiltersChange={setFilters}
        showResource={false}
        showHealth={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-open-risks">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Open Risks</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{openRisks}</div>
          <div className="text-xs text-muted-foreground">{highRisks} high severity</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-mitigated">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Target className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Mitigated</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{mitigatedRisks}</div>
          <div className="text-xs text-muted-foreground">{closedRisks} closed</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-open-issues">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-orange-500/10">
              <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <span className="text-xs text-muted-foreground">Open Issues</span>
          </div>
          <div className="text-2xl font-bold text-orange-500">{openIssues}</div>
          <div className="text-xs text-muted-foreground">{criticalIssues} critical</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-resolved">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resolved</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{resolvedIssues}</div>
          <div className="text-xs text-muted-foreground">issues closed</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-total-risks">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Activity className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Risks</span>
          </div>
          <div className="text-2xl font-bold">{allRisks.length}</div>
          <div className="text-xs text-muted-foreground">across projects</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-total-issues">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <Bug className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Issues</span>
          </div>
          <div className="text-2xl font-bold">{filteredIssues.length}</div>
          <div className="text-xs text-muted-foreground">{highIssues} high priority</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="chart-risk-status">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Risk Status
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riskStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {riskStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-issues-by-priority">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Issues by Priority
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={issuesByPriority}>
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {issuesByPriority.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-risk-heatmap">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Risk Heatmap
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <XAxis type="number" dataKey="impact" domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => ["", "L", "M", "H"][v]} fontSize={10} name="Impact" />
                  <YAxis type="number" dataKey="probability" domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => ["", "L", "M", "H"][v]} fontSize={10} name="Probability" />
                  <ZAxis type="number" dataKey="count" range={[80, 400]} name="Count" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number, name: string) => name === "Count" ? [value, "Risks"] : [["", "Low", "Medium", "High"][value as number], name]}
                  />
                  <Scatter data={riskHeatmapData} fill={COLORS.Red} opacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-top-blockers">
          <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Top Blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[240px]">
              {topBlockers.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-6 w-6 mr-2 text-emerald-500" />
                  No critical blockers
                </div>
              ) : (
                <div className="space-y-2">
                  {topBlockers.map((item) => (
                    <div key={`${item.type}-${item.id}`} className="flex items-start gap-2 p-2 rounded-lg border hover-elevate text-xs" data-testid={`blocker-${item.type.toLowerCase()}-${item.id}`}>
                      {item.type === "Risk" ? <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" /> : <Bug className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.title}</div>
                        <div className="text-muted-foreground truncate">
                          {getProjectName(item.projectId)}
                          {item.costExposure && <span className="ml-2 text-destructive font-medium">${Number(item.costExposure).toLocaleString()}</span>}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-5 flex-shrink-0" style={{ backgroundColor: `${PRIORITY_COLORS[item.severity] || COLORS.Yellow}20`, color: PRIORITY_COLORS[item.severity] || COLORS.Yellow }}>
                        {item.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card data-testid="card-projects-most-issues">
          <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              Projects with Most Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[240px]">
              <div className="space-y-3">
                {projectRiskCounts.map((project) => (
                  <div key={project.id} className="p-2 rounded-lg border hover-elevate cursor-pointer" onClick={() => setLocation(`/projects/${project.id}`)} data-testid={`risk-project-${project.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate max-w-[180px]" title={project.fullName}>{project.name}</span>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-[10px] h-5 bg-destructive/10 text-destructive">{project.risks} risks</Badge>
                        <Badge variant="secondary" className="text-[10px] h-5 bg-orange-500/10 text-orange-600">{project.issues} issues</Badge>
                      </div>
                    </div>
                    <Progress value={(project.risks + project.issues) * 10} className="h-1.5" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
