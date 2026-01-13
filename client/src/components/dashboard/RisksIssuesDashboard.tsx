import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "./KpiCard";
import { DashboardChartCard } from "./DashboardChartCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, ShieldAlert, CheckCircle2, Clock, AlertCircle, Bug, Zap } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, ScatterChart, Scatter, ZAxis } from "recharts";
import type { Risk, Issue } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Orange: "#f97316",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: COLORS.Red,
  High: COLORS.Orange,
  Medium: COLORS.Yellow,
  Low: COLORS.Blue,
};

export function RisksIssuesDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projects, isLoading: projectsLoading } = useProjects(currentOrganization?.id);

  const { data: allRisks, isLoading: risksLoading } = useQuery<Risk[]>({
    queryKey: ['/api/risks/all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/risks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch risks');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: allIssues, isLoading: issuesLoading } = useQuery<Issue[]>({
    queryKey: ['/api/issues/all'],
    queryFn: async () => {
      const res = await fetch('/api/issues');
      if (!res.ok) throw new Error('Failed to fetch issues');
      return res.json();
    },
  });

  if (projectsLoading || risksLoading || issuesLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const risks = allRisks || [];
  const issues = allIssues || [];

  const openRisks = risks.filter(r => r.status === "Open").length;
  const mitigatedRisks = risks.filter(r => r.status === "Mitigated").length;
  const closedRisks = risks.filter(r => r.status === "Closed").length;
  const highRisks = risks.filter(r => r.probability === "High" || r.impact === "High").length;

  const openIssues = issues.filter(i => i.status === "Open" || i.status === "In Progress").length;
  const resolvedIssues = issues.filter(i => i.status === "Resolved" || i.status === "Closed").length;
  const criticalIssues = issues.filter(i => i.priority === "Critical" || i.priority === "High").length;

  const riskStatusData = [
    { name: "Open", value: openRisks, color: COLORS.Red },
    { name: "Mitigated", value: mitigatedRisks, color: COLORS.Yellow },
    { name: "Closed", value: closedRisks, color: COLORS.Green },
  ].filter(d => d.value > 0);

  const issuesByPriority = [
    { name: "Critical", value: issues.filter(i => i.priority === "Critical").length, color: COLORS.Red },
    { name: "High", value: issues.filter(i => i.priority === "High").length, color: COLORS.Orange },
    { name: "Medium", value: issues.filter(i => i.priority === "Medium").length, color: COLORS.Yellow },
    { name: "Low", value: issues.filter(i => i.priority === "Low").length, color: COLORS.Blue },
  ];

  const issuesByType = issues.reduce((acc, issue) => {
    const type = issue.type || "Other";
    const existing = acc.find(i => i.name === type);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: type, value: 1 });
    }
    return acc;
  }, [] as { name: string; value: number }[]);

  const probabilityMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  const impactMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  
  const riskHeatmapData = risks
    .filter(r => r.status === "Open")
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
    ...risks
      .filter(r => r.status === "Open" && (r.probability === "High" || r.impact === "High"))
      .map(r => ({
        id: r.id,
        title: r.title,
        type: "Risk" as const,
        severity: r.impact || "Medium",
        projectId: r.projectId,
      })),
    ...issues
      .filter(i => (i.status === "Open" || i.status === "In Progress") && (i.priority === "Critical" || i.priority === "High"))
      .map(i => ({
        id: i.id,
        title: i.title,
        type: "Issue" as const,
        severity: i.priority || "Medium",
        projectId: i.projectId,
      })),
  ].slice(0, 10);

  const getProjectName = (projectId: number) => {
    const project = projects?.find(p => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Open Risks"
          value={openRisks}
          subtitle={`${highRisks} high severity`}
          icon={ShieldAlert}
          iconColor="text-rose-500"
          borderColor="border-l-rose-500"
          testId="kpi-open-risks"
        />
        <KpiCard
          title="Mitigated Risks"
          value={mitigatedRisks}
          subtitle="Under control"
          icon={CheckCircle2}
          iconColor="text-amber-500"
          borderColor="border-l-amber-500"
          delay={0.2}
          testId="kpi-mitigated-risks"
        />
        <KpiCard
          title="Open Issues"
          value={openIssues}
          subtitle={`${criticalIssues} critical/high`}
          icon={AlertCircle}
          iconColor="text-orange-500"
          borderColor="border-l-orange-500"
          delay={0.3}
          testId="kpi-open-issues"
        />
        <KpiCard
          title="Resolved Issues"
          value={resolvedIssues}
          subtitle="Successfully closed"
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          borderColor="border-l-emerald-500"
          href="/issues"
          delay={0.4}
          testId="kpi-resolved-issues"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardChartCard
          title="Risk Status Overview"
          description="Distribution of risks by current status"
          testId="chart-risk-status"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={riskStatusData}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {riskStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Issues by Priority"
          description="Distribution of issues across priority levels"
          testId="chart-issues-priority"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={issuesByPriority}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {issuesByPriority.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Risk Heatmap"
          description="Probability vs Impact matrix (bubble size = count)"
          testId="chart-risk-heatmap"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <XAxis 
                type="number" 
                dataKey="impact" 
                domain={[0.5, 3.5]} 
                ticks={[1, 2, 3]} 
                tickFormatter={(v) => ["", "Low", "Medium", "High"][v]}
                fontSize={12}
                name="Impact"
              />
              <YAxis 
                type="number" 
                dataKey="probability" 
                domain={[0.5, 3.5]} 
                ticks={[1, 2, 3]} 
                tickFormatter={(v) => ["", "Low", "Medium", "High"][v]}
                fontSize={12}
                name="Probability"
              />
              <ZAxis type="number" dataKey="count" range={[100, 500]} name="Count" />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number, name: string) => {
                  if (name === "Count") return [value, "Risks"];
                  return [["", "Low", "Medium", "High"][value as number], name];
                }}
              />
              <Scatter 
                data={riskHeatmapData} 
                fill={COLORS.Red}
                opacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Issues by Type"
          description="Distribution of issues by category"
          testId="chart-issues-type"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={issuesByType} layout="vertical">
              <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={100} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>
      </div>

      <Card data-testid="card-top-blockers">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            Top Blockers
          </CardTitle>
          <CardDescription>High severity risks and critical issues requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            {topBlockers.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No critical blockers found
              </div>
            ) : (
              <div className="space-y-3">
                {topBlockers.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-start gap-3 rounded-lg border p-3 hover-elevate"
                    data-testid={`blocker-${item.type.toLowerCase()}-${item.id}`}
                  >
                    {item.type === "Risk" ? (
                      <ShieldAlert className="h-5 w-5 text-rose-500 mt-0.5" />
                    ) : (
                      <Bug className="h-5 w-5 text-orange-500 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {getProjectName(item.projectId)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.type}
                      </Badge>
                      <Badge 
                        variant="secondary"
                        className="text-xs"
                        style={{ 
                          backgroundColor: `${PRIORITY_COLORS[item.severity] || COLORS.Yellow}20`,
                          color: PRIORITY_COLORS[item.severity] || COLORS.Yellow,
                        }}
                      >
                        {item.severity}
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
  );
}
