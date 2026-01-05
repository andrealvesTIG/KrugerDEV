import { useState } from "react";
import { useRoute, Link } from "wouter";
import { 
  usePortfolioOverview, 
  usePortfolioProjects, 
  usePortfolioRisks, 
  usePortfolioIssues,
  usePortfolioMilestones,
  type PortfolioRisk,
  type PortfolioIssue
} from "@/hooks/use-portfolio-details";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, DollarSign, Target, AlertTriangle, Bug, 
  CheckCircle2, FolderOpen, TrendingUp, BarChart3, ArrowRight,
  Calendar, Users, Briefcase, AlertCircle, ChevronLeft
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schema";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from "recharts";

export default function PortfolioDetails() {
  const [, params] = useRoute("/portfolios/:id");
  const id = parseInt(params?.id || "0");
  const { data: overview, isLoading } = usePortfolioOverview(id);
  const [activeTab, setActiveTab] = useState("summary");

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!overview) {
    return <div className="p-8 text-center text-muted-foreground">Portfolio not found</div>;
  }

  const { portfolio, metrics } = overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portfolios">
          <Button variant="ghost" size="icon" data-testid="button-back-portfolios">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-display font-bold">{portfolio.name}</h1>
          <p className="text-muted-foreground mt-1">{portfolio.description}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Summary
          </TabsTrigger>
          <TabsTrigger value="projects" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Projects
          </TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Risks
          </TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Issues
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Dashboard
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="summary">
            <SummaryTab metrics={metrics} portfolio={portfolio} onNavigate={setActiveTab} />
          </TabsContent>
          <TabsContent value="projects">
            <ProjectsTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="dashboard">
            <DashboardTab portfolioId={id} metrics={metrics} onNavigate={setActiveTab} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function SummaryTab({ metrics, portfolio, onNavigate }: { 
  metrics: any; 
  portfolio: any;
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("projects")} data-testid="card-metric-projects">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{metrics.projectCount}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {metrics.healthCounts.green > 0 && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-xs">
                  {metrics.healthCounts.green} Healthy
                </Badge>
              )}
              {metrics.healthCounts.yellow > 0 && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 text-xs">
                  {metrics.healthCounts.yellow} At Risk
                </Badge>
              )}
              {metrics.healthCounts.red > 0 && (
                <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 text-xs">
                  {metrics.healthCounts.red} Critical
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-metric-budget">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <span className="text-2xl font-bold">${metrics.totalBudget.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-metric-completion">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold">{metrics.avgCompletion}%</span>
            </div>
            <Progress value={metrics.avgCompletion} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("risks")} data-testid="card-metric-risks">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-2xl font-bold">{metrics.openRisks}</span>
              <span className="text-sm text-muted-foreground">of {metrics.riskCount}</span>
            </div>
            {metrics.highRisks > 0 && (
              <Badge className="mt-2 bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 text-xs">
                {metrics.highRisks} High Priority
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("issues")} data-testid="card-metric-issues">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Issues Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics.openIssues}</p>
                <p className="text-sm text-muted-foreground">Open Issues</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-muted-foreground">{metrics.issueCount}</p>
                <p className="text-sm text-muted-foreground">Total Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-metric-milestones">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics.upcomingMilestones}</p>
                <p className="text-sm text-muted-foreground">Upcoming</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-muted-foreground">{metrics.milestoneCount}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {portfolio.strategy && (
        <Card>
          <CardHeader>
            <CardTitle>Strategic Alignment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{portfolio.strategy}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProjectsTab({ portfolioId }: { portfolioId: number }) {
  const { data: projects, isLoading } = usePortfolioProjects(portfolioId);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  const healthColors: Record<string, string> = {
    Green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    Yellow: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    Red: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  };

  const statusColors: Record<string, string> = {
    Initiation: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Planning: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    Execution: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    Monitoring: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Closing: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Included Projects</CardTitle>
        <CardDescription>All projects within this portfolio</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Project</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Health</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Progress</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Budget</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {projects?.map((project: Project) => (
                <tr key={project.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-project-${project.id}`}>
                  <td className="p-3">
                    <div>
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-xs", statusColors[project.status] || "bg-muted")}>{project.status}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-xs", healthColors[project.health || "Green"])}>{project.health}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Progress value={project.completionPercentage || 0} className="w-20 h-2" />
                      <span className="text-sm">{project.completionPercentage || 0}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm">${Number(project.budget).toLocaleString()}</td>
                  <td className="p-3">
                    <Link href={`/projects/${project.id}`}>
                      <Button variant="ghost" size="sm" data-testid={`button-view-project-${project.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projects?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No projects in this portfolio.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RisksTab({ portfolioId }: { portfolioId: number }) {
  const { data: risks, isLoading } = usePortfolioRisks(portfolioId);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  const probabilityColors: Record<string, string> = {
    Low: "bg-emerald-100 text-emerald-700",
    Medium: "bg-amber-100 text-amber-700",
    High: "bg-rose-100 text-rose-700",
  };

  const impactColors: Record<string, string> = {
    Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    High: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Portfolio Risks
        </CardTitle>
        <CardDescription>Aggregated risks from all projects in this portfolio</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Risk</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Project</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Probability</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Impact</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {risks?.map((risk: PortfolioRisk) => (
                <tr key={risk.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-risk-${risk.id}`}>
                  <td className="p-3">
                    <div>
                      <p className="font-medium">{risk.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{risk.description}</p>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">{risk.projectName}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-xs", probabilityColors[risk.probability || "Medium"])}>{risk.probability}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-xs", impactColors[risk.impact || "Medium"])}>{risk.impact}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={cn("text-xs", risk.status === "Open" ? "border-amber-500 text-amber-700" : "border-emerald-500 text-emerald-700")}>
                      {risk.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {risks?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No risks recorded across portfolio projects.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesTab({ portfolioId }: { portfolioId: number }) {
  const { data: issues, isLoading } = usePortfolioIssues(portfolioId);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  const priorityColors: Record<string, string> = {
    Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    High: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };

  const statusColors: Record<string, string> = {
    Open: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    Resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    Closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-rose-600" />
          Portfolio Issues
        </CardTitle>
        <CardDescription>Aggregated issues from all projects in this portfolio</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Issue</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Project</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Priority</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {issues?.map((issue: PortfolioIssue) => (
                <tr key={issue.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-issue-${issue.id}`}>
                  <td className="p-3">
                    <div>
                      <p className="font-medium">{issue.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{issue.description}</p>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">{issue.projectName}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary" className="text-xs">{issue.type}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-xs", priorityColors[issue.priority || "Medium"])}>{issue.priority}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge className={cn("text-xs", statusColors[issue.status || "Open"])}>{issue.status}</Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{issue.assignee || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {issues?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No issues recorded across portfolio projects.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardTab({ portfolioId, metrics, onNavigate }: { 
  portfolioId: number; 
  metrics: any;
  onNavigate: (tab: string) => void;
}) {
  const { data: projects } = usePortfolioProjects(portfolioId);
  const { data: risks } = usePortfolioRisks(portfolioId);
  const { data: milestones } = usePortfolioMilestones(portfolioId);

  const healthData = [
    { name: "Healthy", value: metrics.healthCounts.green, color: "#10b981" },
    { name: "At Risk", value: metrics.healthCounts.yellow, color: "#f59e0b" },
    { name: "Critical", value: metrics.healthCounts.red, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const projectBudgetData = projects?.slice(0, 5).map(p => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
    budget: Number(p.budget),
    completion: p.completionPercentage || 0,
  })) || [];

  const riskMatrixData = risks?.reduce((acc, r) => {
    const key = `${r.probability}-${r.impact}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const upcomingMilestones = milestones?.filter(m => !m.completed)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("projects")} data-testid="dashboard-card-projects">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-3xl font-bold">{metrics.projectCount}</p>
              </div>
              <Briefcase className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("risks")} data-testid="dashboard-card-risks">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Risks</p>
                <p className="text-3xl font-bold text-amber-600">{metrics.openRisks}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("issues")} data-testid="dashboard-card-issues">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Issues</p>
                <p className="text-3xl font-bold text-rose-600">{metrics.openIssues}</p>
              </div>
              <Bug className="h-8 w-8 text-rose-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="dashboard-card-completion">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Completion</p>
                <p className="text-3xl font-bold text-blue-600">{metrics.avgCompletion}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("projects")} data-testid="dashboard-chart-health">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Project Health Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={healthData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {healthData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No project data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="dashboard-chart-budget">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Project Budgets (Top 5)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projectBudgetData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectBudgetData} layout="vertical">
                    <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Bar dataKey="budget" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No budget data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("risks")} data-testid="dashboard-risk-matrix">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Risk Matrix
            </CardTitle>
            <CardDescription>Risk distribution by probability and impact</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-1">
              <div></div>
              <div className="text-center text-xs text-muted-foreground p-1">Low</div>
              <div className="text-center text-xs text-muted-foreground p-1">Medium</div>
              <div className="text-center text-xs text-muted-foreground p-1">High</div>
              
              <div className="text-xs text-muted-foreground p-1 text-right">High</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["High-Low"] ? "bg-amber-100 text-amber-800" : "bg-muted/50")}>{riskMatrixData["High-Low"] || 0}</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["High-Medium"] ? "bg-rose-100 text-rose-800" : "bg-muted/50")}>{riskMatrixData["High-Medium"] || 0}</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["High-High"] ? "bg-rose-200 text-rose-900" : "bg-muted/50")}>{riskMatrixData["High-High"] || 0}</div>
              
              <div className="text-xs text-muted-foreground p-1 text-right">Medium</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["Medium-Low"] ? "bg-emerald-100 text-emerald-800" : "bg-muted/50")}>{riskMatrixData["Medium-Low"] || 0}</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["Medium-Medium"] ? "bg-amber-100 text-amber-800" : "bg-muted/50")}>{riskMatrixData["Medium-Medium"] || 0}</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["Medium-High"] ? "bg-rose-100 text-rose-800" : "bg-muted/50")}>{riskMatrixData["Medium-High"] || 0}</div>
              
              <div className="text-xs text-muted-foreground p-1 text-right">Low</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["Low-Low"] ? "bg-emerald-100 text-emerald-800" : "bg-muted/50")}>{riskMatrixData["Low-Low"] || 0}</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["Low-Medium"] ? "bg-emerald-100 text-emerald-800" : "bg-muted/50")}>{riskMatrixData["Low-Medium"] || 0}</div>
              <div className={cn("rounded p-2 text-center text-sm font-medium", riskMatrixData["Low-High"] ? "bg-amber-100 text-amber-800" : "bg-muted/50")}>{riskMatrixData["Low-High"] || 0}</div>
            </div>
            <div className="mt-2 text-xs text-center text-muted-foreground">Impact</div>
          </CardContent>
        </Card>

        <Card data-testid="dashboard-milestones">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingMilestones.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg border" data-testid={`milestone-${m.id}`}>
                  <div>
                    <p className="font-medium text-sm">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.projectName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {format(new Date(m.dueDate), 'MMM d')}
                  </Badge>
                </div>
              ))}
              {upcomingMilestones.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No upcoming milestones
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
