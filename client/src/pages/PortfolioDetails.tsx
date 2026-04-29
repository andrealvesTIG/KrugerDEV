import { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { 
  usePortfolioOverview, 
  usePortfolioProjects, 
  usePortfolioRisks, 
  usePortfolioIssues,
  usePortfolioMilestones,
  usePortfolioKeyDates,
  useCreatePortfolioKeyDate,
  useUpdatePortfolioKeyDate,
  useDeletePortfolioKeyDate,
  usePortfolioScoringRollup,
  useUpdatePortfolioScoringConfig,
  type PortfolioRisk,
  type PortfolioIssue
} from "@/hooks/use-portfolio-details";
import { useProjects, useUpdateProject } from "@/hooks/use-projects";
import { useUpdateRisk, useDeleteRisk, useAiMitigationSuggestion, useRiskHistory, useConvertRiskToIssue } from "@/hooks/use-risks";
import { EditRiskDialog, type RiskFormData } from "@/components/EditRiskDialog";
import { useUpdateIssue, useDeleteIssue } from "@/hooks/use-issues";
import { useRiskResourceAssignments, useUpdateRiskResourceAssignments } from "@/hooks/use-resources";
import { useForm, Controller } from "react-hook-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Loader2, DollarSign, Target, AlertTriangle, Bug, 
  CheckCircle2, FolderOpen, TrendingUp, BarChart3, ArrowRight,
  Calendar, Users, Briefcase, AlertCircle, ChevronLeft, ChevronRight, List, GanttChart, Plus, Search, X, Table2, LayoutGrid,
  Star, Award, FileCheck, Pencil, Trash2, Check, MoreHorizontal, MoreVertical, ArrowUpToLine,
  Shield, Share2, Download, FileText, Sparkles, RefreshCw, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, startOfMonth, eachDayOfInterval } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { CompactCurrency } from "@/components/CompactCurrency";
import { cn, normalizeSearch } from "@/lib/utils";
import type { Project, Task } from "@shared/schema";
import ProjectGanttView from "@/components/project/ProjectGanttView";
import PortfolioFinancialGrid from "@/components/PortfolioFinancialGrid";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, CartesianGrid, ReferenceLine
} from "recharts";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectsListView, ProjectsGridView, ProjectsKanbanView, ProjectsGanttView, type GroupByOption } from "@/pages/Projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useCustomFieldDefinitions, useOrganizationProjectCustomFieldValues, useUpdateProjectCustomFieldValue } from "@/hooks/use-custom-fields";
import { useDeleteProject } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";

export default function PortfolioDetails() {
  const [, params] = useRoute("/portfolios/:id");
  const id = parseInt(params?.id || "0");
  const { data: overview, isLoading } = usePortfolioOverview(id);
  const [activeTab, setActiveTab] = useState("summary");
  const { currentOrganization } = useOrganization();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: latestHeaderAssessment } = useQuery<{ riskScore: number; generatedAt: string; summary: string } | null>({
    queryKey: ["/api/portfolios", id, "risk-assessment", "latest"],
  });

  const headerRiskBadge = useMemo(() => {
    if (latestHeaderAssessment?.riskScore === undefined || latestHeaderAssessment?.riskScore === null || !latestHeaderAssessment?.generatedAt) return null;
    const generatedAt = new Date(latestHeaderAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt <= tenDaysAgo) return null;
    return latestHeaderAssessment;
  }, [latestHeaderAssessment]);

  const getRiskBadgeColor = (score: number) => {
    if (score <= 25) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (score <= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    if (score <= 75) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
  };

  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskReport, setRiskReport] = useState<any>(null);
  const [riskShareToken, setRiskShareToken] = useState<string>("");
  const [riskAssessmentId, setRiskAssessmentId] = useState<number | null>(null);
  const [riskConfirmOpen, setRiskConfirmOpen] = useState(false);
  const [forceRecalculate, setForceRecalculate] = useState(false);

  const generateRiskAssessment = useMutation({
    mutationFn: async (options?: { force?: boolean }) => {
      const res = await apiRequest("POST", `/api/portfolios/${id}/risk-assessment`, { force: options?.force || false });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.assessment) {
        setRiskReport(data.assessment.report);
        setRiskShareToken(data.assessment.shareToken || "");
        setRiskAssessmentId(data.assessment.id || null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios", id, "risk-assessment", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios", id, "risk-assessment", "history"] });
      setRiskDialogOpen(true);
      setRiskConfirmOpen(false);
    },
    onError: (err: any) => {
      if (err?.limitExceeded) {
        toast({ title: "Credit Limit Reached", description: err.message || "Please upgrade your plan.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err?.message || "Failed to generate risk assessment. Please try again.", variant: "destructive" });
      }
      setRiskConfirmOpen(false);
    },
  });

  // Redirect if portfolio doesn't belong to current organization
  useEffect(() => {
    if (overview?.portfolio && currentOrganization && overview.portfolio.organizationId !== currentOrganization.id) {
      toast({
        title: "Organization Changed",
        description: "Redirecting to dashboard - this portfolio belongs to a different organization.",
        variant: "default"
      });
      setLocation("/");
    }
  }, [overview, currentOrganization, setLocation, toast]);

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

  const { portfolio, metrics, financialBudgets } = overview;

  const handleRiskAssessmentClick = async () => {
    try {
      const res = await apiRequest("GET", `/api/portfolios/${id}/risk-assessment/latest`);
      const data = await res.json();
      if (data && data.riskScore && data.report) {
        const generatedAt = new Date(data.generatedAt);
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        if (generatedAt > tenDaysAgo) {
          setRiskReport(data.report);
          setRiskShareToken(data.shareToken || "");
          setRiskAssessmentId(data.id || null);
          setRiskDialogOpen(true);
          return;
        }
      }
      setRiskConfirmOpen(true);
    } catch {
      setRiskConfirmOpen(true);
    }
  };

  const handleRecalculateRisk = () => {
    setForceRecalculate(true);
    setRiskConfirmOpen(true);
  };

  const getRiskScoreColor = (score: number) => {
    if (score <= 25) return "text-emerald-600 dark:text-emerald-400";
    if (score <= 50) return "text-amber-500 dark:text-amber-400";
    if (score <= 75) return "text-orange-500 dark:text-orange-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getRiskScoreBg = (score: number) => {
    if (score <= 25) return "bg-emerald-100 dark:bg-emerald-900/50";
    if (score <= 50) return "bg-amber-100 dark:bg-amber-900/50";
    if (score <= 75) return "bg-orange-100 dark:bg-orange-900/50";
    return "bg-rose-100 dark:bg-rose-900/50";
  };

  const getRiskScoreLabel = (score: number) => {
    if (score <= 25) return "Low Risk";
    if (score <= 50) return "Moderate Risk";
    if (score <= 75) return "High Risk";
    return "Critical Risk";
  };

  // Don't render if portfolio doesn't match current organization (will redirect)
  if (currentOrganization && portfolio.organizationId !== currentOrganization.id) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portfolios">
          <Button variant="ghost" size="icon" data-testid="button-back-portfolios">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-bold truncate" title={portfolio.name || ""}>{portfolio.name}</h1>
            {portfolio.isCustom && (
              <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 shrink-0">
                Custom Portfolio
              </Badge>
            )}
            {headerRiskBadge && (
              <Badge
                variant="secondary"
                className={`gap-1 shrink-0 ${getRiskBadgeColor(headerRiskBadge.riskScore)}`}
                data-testid="badge-portfolio-risk-score"
                title={headerRiskBadge.summary}
              >
                <Shield className="h-3 w-3" />
                Risk Score: {headerRiskBadge.riskScore}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 truncate" title={portfolio.description || ""}>{portfolio.description}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl flex-wrap gap-1 h-auto">
          <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Summary
          </TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Tasks
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
          <TabsTrigger value="key-dates" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Key Dates
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="financials" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Financials
          </TabsTrigger>
          <TabsTrigger value="scoring" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Scoring
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="summary">
            <SummaryTab metrics={metrics} portfolio={portfolio} portfolioId={id} onNavigate={setActiveTab} getRiskScoreColor={getRiskScoreColor} getRiskScoreBg={getRiskScoreBg} getRiskScoreLabel={getRiskScoreLabel} />
          </TabsContent>
          <TabsContent value="tasks">
            <PortfolioTasksTab portfolioId={id} organizationId={currentOrganization?.id || 0} />
          </TabsContent>
          <TabsContent value="projects">
            <ProjectsTab portfolioId={id} organizationId={currentOrganization?.id || 0} isCustom={!!portfolio.isCustom} financialBudgets={financialBudgets} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab
              portfolioId={id}
              portfolioName={portfolio.name}
              onRiskAssessmentClick={handleRiskAssessmentClick}
              onRecalculateRisk={handleRecalculateRisk}
              generateRiskAssessment={generateRiskAssessment}
              riskConfirmOpen={riskConfirmOpen}
              setRiskConfirmOpen={setRiskConfirmOpen}
              forceRecalculate={forceRecalculate}
              setForceRecalculate={setForceRecalculate}
              riskDialogOpen={riskDialogOpen}
              setRiskDialogOpen={setRiskDialogOpen}
              riskReport={riskReport}
              riskAssessmentId={riskAssessmentId}
              riskShareToken={riskShareToken}
              getRiskScoreColor={getRiskScoreColor}
              getRiskScoreBg={getRiskScoreBg}
              getRiskScoreLabel={getRiskScoreLabel}
            />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="key-dates">
            <KeyDatesTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="dashboard">
            <DashboardTab portfolioId={id} metrics={metrics} onNavigate={setActiveTab} financialBudgets={financialBudgets} />
          </TabsContent>
          <TabsContent value="financials">
            <PortfolioFinancialGrid portfolioId={id} />
          </TabsContent>
          <TabsContent value="scoring">
            <PortfolioScoringTab portfolioId={id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function SummaryTab({ metrics, portfolio, portfolioId, onNavigate, getRiskScoreColor, getRiskScoreBg, getRiskScoreLabel }: { 
  metrics: any; 
  portfolio: any;
  portfolioId: number;
  onNavigate: (tab: string) => void;
  getRiskScoreColor: (score: number) => string;
  getRiskScoreBg: (score: number) => string;
  getRiskScoreLabel: (score: number) => string;
}) {
  const { data: latestAssessment } = useQuery<{ riskScore: number; generatedAt: string; summary: string } | null>({
    queryKey: ["/api/portfolios", portfolioId, "risk-assessment", "latest"],
  });

  const { data: issuesData } = usePortfolioIssues(portfolioId);
  const { data: keyDatesData } = usePortfolioKeyDates(portfolioId);

  const openIssues = useMemo(() => {
    if (!issuesData) return [];
    return issuesData
      .filter((i: any) => i.status === "Open" || i.status === "In Progress" || i.status === "Escalated" || i.status === "Pending")
      .sort((a: any, b: any) => {
        const pOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        return (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4);
      })
      .slice(0, 5);
  }, [issuesData]);

  const upcomingKeyDates = useMemo(() => {
    if (!keyDatesData) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return keyDatesData
      .filter((kd: any) => !kd.completed && kd.date)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [keyDatesData]);

  const recentAssessment = useMemo(() => {
    if (!latestAssessment?.riskScore || !latestAssessment?.generatedAt) return null;
    const generatedAt = new Date(latestAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt > tenDaysAgo) return { score: latestAssessment.riskScore, generatedAt };
    return null;
  }, [latestAssessment]);

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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget (AOP)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CompactCurrency value={metrics.totalBudget} className="text-2xl font-bold" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-metric-completion">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Progress</CardTitle>
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
            {recentAssessment && (
              <div className="mt-2 flex items-center gap-2" data-testid="display-summary-risk-score">
                <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md", getRiskScoreBg(recentAssessment.score))}>
                  <Shield className="h-3.5 w-3.5" />
                  <span className={cn("text-sm font-bold", getRiskScoreColor(recentAssessment.score))}>
                    {recentAssessment.score}
                  </span>
                  <span className={cn("text-xs font-medium", getRiskScoreColor(recentAssessment.score))}>
                    {getRiskScoreLabel(recentAssessment.score)}
                  </span>
                </div>
              </div>
            )}
            {!recentAssessment && metrics.highRisks > 0 && (
              <Badge className="mt-2 bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 text-xs">
                {metrics.highRisks} High Priority
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-metric-issues">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5" />
                Issues Overview
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => onNavigate("issues")}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-3xl font-bold">{metrics.openIssues}</p>
                <p className="text-sm text-muted-foreground">Open Issues</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-muted-foreground">{metrics.issueCount}</p>
                <p className="text-sm text-muted-foreground">Total Issues</p>
              </div>
            </div>
            {openIssues.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                {openIssues.map((issue: any) => {
                  const priorityColors: Record<string, string> = {
                    Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
                    High: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
                    Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
                    Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                  };
                  const statusColors: Record<string, string> = {
                    Open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                    "In Progress": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
                    Escalated: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
                    Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                  };
                  return (
                    <div key={issue.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium truncate">{issue.title}</span>
                          <Badge className={cn("text-[10px] px-1.5 py-0 h-4", priorityColors[issue.priority] || "bg-muted")}>
                            {issue.priority}
                          </Badge>
                          <Badge className={cn("text-[10px] px-1.5 py-0 h-4", statusColors[issue.status] || "bg-muted")}>
                            {issue.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground truncate">{issue.projectName}</span>
                          {issue.assignee && (
                            <span className="text-[11px] text-muted-foreground">· {issue.assignee}</span>
                          )}
                          {issue.targetResolutionDate && (
                            <span className={cn("text-[11px]", new Date(issue.targetResolutionDate) < new Date() ? "text-rose-500 font-medium" : "text-muted-foreground")}>
                              · Due {format(new Date(issue.targetResolutionDate), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {metrics.openIssues > 5 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center pt-1"
                    onClick={() => onNavigate("issues")}
                  >
                    +{metrics.openIssues - 5} more open issues
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-metric-milestones">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Key Dates
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {metrics.upcomingKeyDates} upcoming
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-3xl font-bold">{metrics.upcomingKeyDates}</p>
                <p className="text-sm text-muted-foreground">Upcoming</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-muted-foreground">{metrics.keyDateCount}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
            {upcomingKeyDates.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                {upcomingKeyDates.map((kd: any) => {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const due = new Date(kd.date);
                  const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = diffDays < 0;
                  const isUrgent = diffDays >= 0 && diffDays <= 7;

                  const keyDateStatusColors: Record<string, string> = {
                    Upcoming: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                    "At Risk": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                    Overdue: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
                    Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                  };

                  return (
                    <div key={kd.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <Target className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", isOverdue ? "text-rose-500" : isUrgent ? "text-amber-500" : "text-muted-foreground")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium truncate">{kd.title}</span>
                          {kd.status && kd.status !== "Upcoming" && (
                            <Badge className={cn("text-[10px] px-1.5 py-0 h-4", keyDateStatusColors[kd.status] || "bg-muted")}>
                              {kd.status}
                            </Badge>
                          )}
                          {kd.keyDateType && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {kd.keyDateType}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn("text-[11px] font-medium", isOverdue ? "text-rose-500" : isUrgent ? "text-amber-500" : "text-muted-foreground")}>
                            {isOverdue ? `${Math.abs(diffDays)}d overdue` : diffDays === 0 ? "Due today" : `Due in ${diffDays}d`}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            · {format(due, "MMM d, yyyy")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {metrics.upcomingKeyDates > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{metrics.upcomingKeyDates - 5} more upcoming key dates
                  </p>
                )}
              </div>
            )}
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

type PortfolioZoomLevel = 30 | 60 | 90 | 180 | 365 | 730 | 1095 | 1825;
type PortfolioRangePreset = "month" | "quarter" | "year" | "2year" | "3year" | "5year" | "custom";
const portfolioZoomDaysArray: PortfolioZoomLevel[] = [30, 60, 90, 180, 365, 730, 1095, 1825];
const portfolioZoomLabels: Record<PortfolioZoomLevel, string> = {
  30: '1 Month',
  60: '2 Months',
  90: '3 Months',
  180: '6 Months',
  365: '1 Year',
  730: '2 Years',
  1095: '3 Years',
  1825: '5 Years'
};

function ProjectsTab({ portfolioId, organizationId, isCustom, financialBudgets }: { portfolioId: number; organizationId: number; isCustom?: boolean; financialBudgets?: Record<number, number> }) {
  const { data: projects, isLoading } = usePortfolioProjects(portfolioId);
  const { data: allProjects } = useProjects(organizationId);
  const { data: portfoliosList } = usePortfolios(organizationId);
  const { user } = useAuth();
  const deleteProject = useDeleteProject();
  const updateCfValue = useUpdateProjectCustomFieldValue();
  const viewStorageKey = `portfolio-${portfolioId}-projects-view`;
  const [view, setView] = useState<"list" | "grid" | "kanban" | "gantt">(() => {
    try {
      const stored = localStorage.getItem(viewStorageKey);
      if (stored === "list" || stored === "grid" || stored === "kanban" || stored === "gantt") return stored;
    } catch {}
    return "list";
  });
  useEffect(() => { try { localStorage.setItem(viewStorageKey, view); } catch {} }, [view, viewStorageKey]);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'org_admin';
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const updateProject = useUpdateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const groupByStorageKey = `portfolio-${portfolioId}-list-group-by`;
  const [listGroupBy, setListGroupBy] = useState<GroupByOption>(() => {
    try { return (localStorage.getItem(groupByStorageKey) as GroupByOption) || "none"; } catch { return "none"; }
  });
  useEffect(() => { try { localStorage.setItem(groupByStorageKey, listGroupBy); } catch {} }, [listGroupBy, groupByStorageKey]);
  const [removeProjectId, setRemoveProjectId] = useState<number | null>(null);
  const { data: customFieldDefs } = useCustomFieldDefinitions(organizationId);
  const { data: cfValues } = useOrganizationProjectCustomFieldValues(organizationId);
  const projectProgress = useMemo(() => {
    const map: Record<number, number> = {};
    (projects || []).forEach(p => { map[p.id] = p.completionPercentage || 0; });
    return map;
  }, [projects]);
  const handleStatusChange = (projectId: number, newStatus: string) => {
    updateProject.mutate({ id: projectId, status: newStatus });
  };

  const availableProjects = useMemo(() => {
    if (!allProjects) return [];
    const portfolioProjectIds = new Set(projects?.map(p => p.id) || []);
    if (isCustom) {
      return allProjects.filter(p => !portfolioProjectIds.has(p.id));
    }
    return allProjects.filter(p => 
      !portfolioProjectIds.has(p.id) && 
      (p.portfolioId === null || p.portfolioId === undefined)
    );
  }, [allProjects, projects, isCustom]);

  const filteredAvailableProjects = useMemo(() => {
    if (!searchQuery.trim()) return availableProjects;
    const query = normalizeSearch(searchQuery);
    return availableProjects.filter(p => 
      normalizeSearch(p.name).includes(query) || 
      normalizeSearch(p.description).includes(query)
    );
  }, [availableProjects, searchQuery]);

  const handleToggleProject = (projectId: number) => {
    setSelectedProjectIds(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleAddProjects = async () => {
    if (selectedProjectIds.length === 0) return;
    setIsAdding(true);
    try {
      if (isCustom) {
        const batchSize = 5;
        for (let i = 0; i < selectedProjectIds.length; i += batchSize) {
          const batch = selectedProjectIds.slice(i, i + batchSize);
          await Promise.all(
            batch.map(projectId => 
              apiRequest("POST", `/api/portfolios/${portfolioId}/custom-projects`, { projectId })
            )
          );
        }
      } else {
        await Promise.all(
          selectedProjectIds.map(projectId => 
            updateProject.mutateAsync({ id: projectId, portfolioId })
          )
        );
      }
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'overview'] });
      toast({
        title: "Projects Added",
        description: `Successfully added ${selectedProjectIds.length} project(s) to the portfolio.`,
      });
      setIsAddDialogOpen(false);
      setSelectedProjectIds([]);
      setSearchQuery("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add some projects to the portfolio.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveProject = async (projectId: number) => {
    try {
      if (isCustom) {
        await apiRequest("DELETE", `/api/portfolios/${portfolioId}/custom-projects/${projectId}`);
      } else {
        await updateProject.mutateAsync({ id: projectId, portfolioId: null });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'overview'] });
      toast({
        title: "Project Removed",
        description: "Project has been removed from the portfolio.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove project from portfolio.",
        variant: "destructive",
      });
    }
  };

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
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Included Projects</CardTitle>
              {isCustom && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                  Custom
                </Badge>
              )}
            </div>
            <CardDescription>
              {isCustom 
                ? "Projects included in this custom portfolio (can include projects from any portfolio)" 
                : "All projects within this portfolio"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
              data-testid="button-add-project-to-portfolio"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Project</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <div className="flex flex-wrap sm:flex-nowrap rounded-lg border border-border overflow-hidden">
              <Button
                variant={view === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("list")}
                className="rounded-none px-2 sm:px-3"
                data-testid="button-portfolio-view-list"
              >
                <List className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">List</span>
              </Button>
              <Button
                variant={view === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("grid")}
                className="rounded-none px-2 sm:px-3"
                data-testid="button-portfolio-view-grid"
              >
                <Table2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Grid</span>
              </Button>
              <Button
                variant={view === "kanban" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("kanban")}
                className="rounded-none px-2 sm:px-3"
                data-testid="button-portfolio-view-kanban"
              >
                <LayoutGrid className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Kanban</span>
              </Button>
              <Button
                variant={view === "gantt" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("gantt")}
                className="rounded-none px-2 sm:px-3"
                data-testid="button-portfolio-view-gantt"
              >
                <GanttChart className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Gantt</span>
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === "list" ? (
          <ProjectsListView
            projects={projects || []}
            filteredProjects={projects || []}
            portfolios={portfoliosList || []}
            projectProgress={projectProgress}
            getRiskScoreForProject={() => undefined}
            getRiskScoreColor={() => ""}
            handleStatusChange={handleStatusChange}
            setDeleteProjectId={(id) => setRemoveProjectId(id)}
            setRiskAssessProjectId={() => {}}
            currentPage={1}
            totalPages={1}
            pageSize={projects?.length || 0}
            onPageChange={() => {}}
            isLoading={isLoading}
            groupBy={listGroupBy}
            onGroupByChange={setListGroupBy}
            customFieldDefs={customFieldDefs}
            customFieldValues={cfValues}
            organizationId={organizationId || null}
            portfolioId={portfolioId}
          />
        ) : view === "grid" ? (
          <ProjectsGridView
            projects={projects || []}
            portfolios={portfoliosList || []}
            onStatusChange={handleStatusChange}
            onDeleteProject={(id) => setRemoveProjectId(id)}
            onUpdateProject={(id, data) => updateProject.mutate({ id, ...data })}
            isAdmin={isAdmin}
            organizationId={organizationId || null}
          />
        ) : view === "kanban" ? (
          <ProjectsKanbanView
            projects={projects || []}
            portfolios={portfoliosList || []}
            onStatusChange={handleStatusChange}
            onPortfolioChange={(projectId, newPortfolioId) => updateProject.mutate({ id: projectId, portfolioId: newPortfolioId })}
            onProjectUpdate={(projectId, updates) => updateProject.mutate({ id: projectId, ...updates })}
            customFieldDefs={customFieldDefs || []}
            cfValues={cfValues || []}
            onCustomFieldChange={(projectId, fieldDefinitionId, value) => updateCfValue.mutate({ projectId, fieldDefinitionId, value })}
          />
        ) : (
          <ProjectsGanttView projects={projects || []} organizationId={organizationId || null} />
        )}
      </CardContent>
    </Card>
    <AlertDialog open={removeProjectId !== null} onOpenChange={(open) => !open && setRemoveProjectId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove project from portfolio?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the project from this portfolio. The project itself will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (removeProjectId !== null) {
                handleRemoveProject(removeProjectId);
                setRemoveProjectId(null);
              }
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="confirm-remove-project"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Projects to Portfolio</DialogTitle>
          <DialogDescription>
            {isCustom 
              ? "Select any projects to include in this custom portfolio. Projects can belong to multiple custom portfolios."
              : "Select projects to add to this portfolio. Only unassigned projects are shown."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-projects"
            />
          </div>

          {isCustom && filteredAvailableProjects.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={filteredAvailableProjects.length > 0 && filteredAvailableProjects.every(p => selectedProjectIds.includes(p.id))}
                onCheckedChange={(checked) => {
                  if (checked) {
                    const allIds = filteredAvailableProjects.map(p => p.id);
                    setSelectedProjectIds(prev => [...new Set([...prev, ...allIds])]);
                  } else {
                    const filteredIds = new Set(filteredAvailableProjects.map(p => p.id));
                    setSelectedProjectIds(prev => prev.filter(id => !filteredIds.has(id)));
                  }
                }}
                data-testid="checkbox-select-all-projects"
              />
              <span className="text-sm text-muted-foreground">
                Select All ({filteredAvailableProjects.length})
              </span>
            </div>
          )}

          <div className="flex-1 min-h-[200px] max-h-[400px] border rounded-md overflow-y-auto">
            {filteredAvailableProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <FolderOpen className="h-8 w-8 mb-2" />
                <p className="text-sm text-center">
                  {availableProjects.length === 0 
                    ? (isCustom 
                        ? "All projects are already included in this portfolio."
                        : "No unassigned projects available. All projects are already in portfolios.")
                    : "No projects match your search."}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredAvailableProjects.map((project) => (
                  <div
                    key={project.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedProjectIds.includes(project.id)
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => handleToggleProject(project.id)}
                    data-testid={`project-option-${project.id}`}
                  >
                    <Checkbox
                      checked={selectedProjectIds.includes(project.id)}
                      onCheckedChange={() => handleToggleProject(project.id)}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{project.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{project.description || "No description"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedProjectIds.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedProjectIds.length} project(s) selected
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setIsAddDialogOpen(false);
            setSelectedProjectIds([]);
            setSearchQuery("");
          }}>
            Cancel
          </Button>
          <Button
            onClick={handleAddProjects}
            disabled={selectedProjectIds.length === 0 || isAdding}
            data-testid="button-confirm-add-projects"
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add {selectedProjectIds.length > 0 ? `${selectedProjectIds.length} Project(s)` : "Projects"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function PortfolioProjectsGanttView({ projects }: { projects: Project[] }) {
  const [zoomDays, setZoomDays] = useState<PortfolioZoomLevel>(90);
  const [rangePreset, setRangePreset] = useState<PortfolioRangePreset>("custom");
  const [timelineStart, setTimelineStart] = useState(() => {
    const projectsWithDates = projects.filter(p => p.startDate);
    if (projectsWithDates.length > 0) {
      const earliestStart = projectsWithDates.reduce((earliest, p) => {
        const start = parseISO(p.startDate!);
        return start < earliest ? start : earliest;
      }, parseISO(projectsWithDates[0].startDate!));
      return startOfMonth(earliestStart);
    }
    return startOfMonth(new Date());
  });

  const timelineEnd = addDays(timelineStart, zoomDays - 1);
  const days = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
  const totalDays = days.length;

  const getBarPosition = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    const startOffset = Math.max(0, differenceInDays(start, timelineStart));
    const duration = differenceInDays(end, start) + 1;
    const endOffset = startOffset + duration;
    
    if (endOffset <= 0 || startOffset >= totalDays) return null;
    
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(totalDays, endOffset);
    
    return {
      left: `${(clampedStart / totalDays) * 100}%`,
      width: `${((clampedEnd - clampedStart) / totalDays) * 100}%`,
    };
  };

  const getTimeMarkers = () => {
    return days.reduce((acc, day, index) => {
      if (zoomDays <= 60) {
        if (day.getDate() === 1 || day.getDate() === 15 || index === 0) {
          acc.push({ index, label: format(day, 'MMM d') });
        }
      } else if (zoomDays <= 180) {
        if (day.getDate() === 1 || index === 0) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else if (zoomDays <= 365) {
        if (day.getDate() === 1 && (day.getMonth() % 3 === 0 || index === 0)) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else if (zoomDays <= 1095) {
        // 2-3 years: show every 6 months
        if (day.getDate() === 1 && (day.getMonth() % 6 === 0 || index === 0)) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else {
        // 5 years: show yearly
        if (day.getDate() === 1 && day.getMonth() === 0) {
          acc.push({ index, label: format(day, 'yyyy') });
        }
      }
      return acc;
    }, [] as { index: number; label: string }[]);
  };

  const handleZoomIn = () => {
    setRangePreset("custom");
    const idx = portfolioZoomDaysArray.indexOf(zoomDays);
    if (idx > 0) setZoomDays(portfolioZoomDaysArray[idx - 1]);
  };

  const handleZoomOut = () => {
    setRangePreset("custom");
    const idx = portfolioZoomDaysArray.indexOf(zoomDays);
    if (idx < portfolioZoomDaysArray.length - 1) setZoomDays(portfolioZoomDaysArray[idx + 1]);
  };

  const handleRangePreset = (preset: PortfolioRangePreset) => {
    setRangePreset(preset);
    const today = new Date();
    if (preset === "month") {
      setTimelineStart(startOfMonth(today));
      setZoomDays(30);
    } else if (preset === "quarter") {
      const quarterStart = startOfMonth(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1));
      setTimelineStart(quarterStart);
      setZoomDays(90);
    } else if (preset === "year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(365);
    } else if (preset === "2year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(730);
    } else if (preset === "3year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(1095);
    } else if (preset === "5year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(1825);
    }
  };

  const navigateTimeline = (direction: 'prev' | 'next') => {
    setRangePreset("custom");
    const step = zoomDays <= 60 ? 30 : zoomDays <= 180 ? 30 : 90;
    setTimelineStart(prev => addDays(prev, direction === 'next' ? step : -step));
  };

  const goToToday = () => {
    setRangePreset("custom");
    setTimelineStart(startOfMonth(new Date()));
  };

  const timeMarkers = getTimeMarkers();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateTimeline('prev')} data-testid="button-portfolio-gantt-prev">
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-portfolio-gantt-today">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateTimeline('next')} data-testid="button-portfolio-gantt-next">
            Next
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Range:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <Button
              variant={rangePreset === "month" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none text-xs px-3"
              onClick={() => handleRangePreset("month")}
              data-testid="button-portfolio-range-month"
            >
              Month
            </Button>
            <Button
              variant={rangePreset === "quarter" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none text-xs px-3"
              onClick={() => handleRangePreset("quarter")}
              data-testid="button-portfolio-range-quarter"
            >
              Quarter
            </Button>
            <Button
              variant={rangePreset === "year" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none text-xs px-3"
              onClick={() => handleRangePreset("year")}
              data-testid="button-portfolio-range-year"
            >
              Year
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Zoom:</span>
          <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={portfolioZoomDaysArray.indexOf(zoomDays) === 0} data-testid="button-portfolio-zoom-in">
            +
          </Button>
          <span className="text-xs text-muted-foreground min-w-[60px] text-center">{portfolioZoomLabels[zoomDays]}</span>
          <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={portfolioZoomDaysArray.indexOf(zoomDays) === portfolioZoomDaysArray.length - 1} data-testid="button-portfolio-zoom-out">
            -
          </Button>
        </div>

        <span className="text-sm text-muted-foreground">
          {format(timelineStart, 'MMM d, yyyy')} - {format(timelineEnd, 'MMM d, yyyy')}
        </span>
      </div>

      <div className="relative overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="flex border-b border-border mb-2">
            <div className="w-64 flex-shrink-0 p-2 font-semibold text-sm">Project</div>
            <div className="flex-1 relative h-8">
              {timeMarkers.map((marker, i) => (
                <div 
                  key={i}
                  className="absolute text-xs text-muted-foreground"
                  style={{ left: `${(marker.index / totalDays) * 100}%` }}
                >
                  {marker.label}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {projects.map(project => {
              const barPosition = getBarPosition(project.startDate, project.endDate);
              
              return (
                <div key={project.id} className="flex items-center">
                  <div className="w-64 flex-shrink-0 p-2">
                    <Link href={`/projects/${project.id}`}>
                      <div className="hover:text-primary cursor-pointer">
                        <div className="font-medium text-sm truncate">{project.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{project.status}</Badge>
                          <span className="text-xs text-muted-foreground">{project.completionPercentage}%</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                  <div className="flex-1 relative h-10 bg-muted/30 rounded">
                    {barPosition ? (
                      <div
                        className={cn(
                          "absolute top-1 bottom-1 rounded-md flex items-center justify-center text-xs font-medium text-white",
                          project.health === 'Green' && "bg-emerald-500",
                          project.health === 'Yellow' && "bg-amber-500",
                          project.health === 'Red' && "bg-rose-500",
                          !project.health && "bg-primary"
                        )}
                        style={barPosition}
                        data-testid={`portfolio-gantt-bar-${project.id}`}
                      >
                        <div className="truncate px-2">
                          {project.startDate && project.endDate && (
                            <span>{differenceInDays(parseISO(project.endDate), parseISO(project.startDate)) + 1}d</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                        No dates set
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {projects.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No projects to display
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RisksTab({ portfolioId, portfolioName, onRiskAssessmentClick, onRecalculateRisk, generateRiskAssessment, riskConfirmOpen, setRiskConfirmOpen, forceRecalculate, setForceRecalculate, riskDialogOpen, setRiskDialogOpen, riskReport, riskAssessmentId, riskShareToken, getRiskScoreColor, getRiskScoreBg, getRiskScoreLabel }: {
  portfolioId: number;
  portfolioName: string;
  onRiskAssessmentClick: () => void;
  onRecalculateRisk: () => void;
  generateRiskAssessment: any;
  riskConfirmOpen: boolean;
  setRiskConfirmOpen: (open: boolean) => void;
  forceRecalculate: boolean;
  setForceRecalculate: (v: boolean) => void;
  riskDialogOpen: boolean;
  setRiskDialogOpen: (open: boolean) => void;
  riskReport: any;
  riskAssessmentId: number | null;
  riskShareToken: string;
  getRiskScoreColor: (score: number) => string;
  getRiskScoreBg: (score: number) => string;
  getRiskScoreLabel: (score: number) => string;
}) {
  const { data: risks, isLoading, refetch } = usePortfolioRisks(portfolioId);
  const { data: latestAssessment } = useQuery<{ riskScore: number; generatedAt: string; summary: string } | null>({
    queryKey: ["/api/portfolios", portfolioId, "risk-assessment", "latest"],
  });
  const { currentOrganization } = useOrganization();
  const [editingRisk, setEditingRisk] = useState<PortfolioRisk | null>(null);
  const [deleteRisk, setDeleteRisk] = useState<PortfolioRisk | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const updateRisk = useUpdateRisk();
  const deleteRiskMutation = useDeleteRisk();
  const convertRiskToIssue = useConvertRiskToIssue();
  const updateRiskResources = useUpdateRiskResourceAssignments();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const { data: riskHistory, isLoading: riskHistoryLoading } = useRiskHistory(editingRisk?.id || 0);
  const { data: riskAssignments } = useRiskResourceAssignments(editingRisk?.id || null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (riskAssignments && editingRisk) {
      setSelectedResourceIds(riskAssignments.map(a => a.resourceId));
    }
  }, [riskAssignments, editingRisk]);

  const recentAssessment = useMemo(() => {
    if (!latestAssessment?.riskScore || !latestAssessment?.generatedAt) return null;
    const generatedAt = new Date(latestAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt > tenDaysAgo) return { score: latestAssessment.riskScore, generatedAt };
    return null;
  }, [latestAssessment]);

  const onEditSubmit = async (data: RiskFormData) => {
    if (!editingRisk) return;
    try {
      await updateRisk.mutateAsync({ id: editingRisk.id, projectId: editingRisk.projectId, ...data });
      updateRiskResources.mutate({ riskId: editingRisk.id, resourceIds: selectedResourceIds });
      toast({ title: "Success", description: "Risk updated successfully" });
      setEditingRisk(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteRisk) return;
    try {
      await deleteRiskMutation.mutateAsync({ id: deleteRisk.id, projectId: deleteRisk.projectId });
      toast({ title: "Success", description: "Risk deleted successfully" });
      setDeleteRisk(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  const allRisks = risks || [];
  const escalatedRisks = allRisks.filter((risk: PortfolioRisk) => risk.escalatedToPortfolio);

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Portfolio Risks
              </CardTitle>
              <CardDescription className="mt-1">All risks from projects in this portfolio ({allRisks.length} total, {escalatedRisks.length} escalated)</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {recentAssessment && (
                <div
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={onRiskAssessmentClick}
                  data-testid="display-current-risk-score"
                >
                  <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md", getRiskScoreBg(recentAssessment.score))}>
                    <Shield className="h-4 w-4" />
                    <span className={cn("text-lg font-bold", getRiskScoreColor(recentAssessment.score))} data-testid="text-current-risk-score">
                      {recentAssessment.score}
                    </span>
                    <span className={cn("text-xs font-medium", getRiskScoreColor(recentAssessment.score))}>
                      {getRiskScoreLabel(recentAssessment.score)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-risk-score-date">
                    {recentAssessment.generatedAt.toLocaleDateString()}
                  </span>
                </div>
              )}
              {recentAssessment ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRecalculateRisk}
                  disabled={generateRiskAssessment.isPending}
                  data-testid="button-recalculate-risk"
                >
                  {generateRiskAssessment.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Recalculate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRiskAssessmentClick}
                  disabled={generateRiskAssessment.isPending}
                  data-testid="button-risk-assessment"
                >
                  {generateRiskAssessment.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">AI Risk Assessment</span>
                  <span className="sm:hidden">AI Risk</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Risk</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground hidden sm:table-cell">Project</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Probability</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Impact</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Due Date</th>
                  <th className="p-3 text-right text-sm font-medium text-muted-foreground hidden lg:table-cell">Cost Exposure</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {allRisks.map((risk: PortfolioRisk) => (
                  <tr 
                    key={risk.id} 
                    className="border-b hover:bg-muted/30 transition-colors cursor-pointer group" 
                    data-testid={`row-risk-${risk.id}`}
                    onClick={() => setEditingRisk(risk)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {risk.escalatedToPortfolio && (
                          <ArrowUpToLine className="h-4 w-4 text-amber-600 flex-shrink-0" title="Escalated to Portfolio" />
                        )}
                        <div>
                          <p className="font-medium hover:text-primary">{risk.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">{risk.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/projects/${risk.projectId}`}>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">{risk.projectName}</Badge>
                      </Link>
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
                    <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">
                      {risk.dueDate ? new Date(risk.dueDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-sm text-right tabular-nums hidden lg:table-cell">
                      {risk.costExposure ? <CompactCurrency value={risk.costExposure} /> : "—"}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" data-testid={`menu-risk-${risk.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingRisk(risk)} data-testid={`edit-risk-${risk.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteRisk(risk)} className="text-red-600" data-testid={`delete-risk-${risk.id}`}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allRisks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No risks found in projects within this portfolio.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <RiskScoreTrendChart portfolioId={portfolioId} getRiskScoreColor={getRiskScoreColor} />

      <EditRiskDialog
        open={!!editingRisk}
        onOpenChange={(open) => !open && setEditingRisk(null)}
        risk={editingRisk}
        onSubmit={onEditSubmit}
        isSubmitting={updateRisk.isPending}
        projectLink={editingRisk ? { name: editingRisk.projectName, id: editingRisk.projectId } : null}
        portfolioLink={{ name: portfolioName, id: portfolioId }}
        organizationId={currentOrganization?.id}
        resourceIds={selectedResourceIds}
        onResourcesChange={setSelectedResourceIds}
        projectName={editingRisk?.projectName}
        onConvertToIssue={() => {
          if (editingRisk) {
            convertRiskToIssue.mutate({ id: editingRisk.id, projectId: editingRisk.projectId }, {
              onSuccess: () => {
                toast({ title: "Success", description: "Risk converted to issue" });
                setEditingRisk(null);
                refetch();
                queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId] });
              },
              onError: (err: any) => {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            });
          }
        }}
        isConverting={convertRiskToIssue.isPending}
        history={riskHistory || []}
        historyLoading={riskHistoryLoading}
        onAiSuggest={(data) => aiMitigationSuggestion.mutateAsync(data)}
        isAiSuggesting={aiMitigationSuggestion.isPending}
        onDelete={() => {
          if (editingRisk) {
            deleteRiskMutation.mutate({ id: editingRisk.id, projectId: editingRisk.projectId }, {
              onSuccess: () => {
                toast({ title: "Deleted", description: "Risk deleted" });
                setEditingRisk(null);
                refetch();
                queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId] });
              },
              onError: (err: any) => {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            });
          }
        }}
        isDeleting={deleteRiskMutation.isPending}
      />

      <AlertDialog open={!!deleteRisk} onOpenChange={(open) => !open && setDeleteRisk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Risk</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteRisk?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" data-testid="button-confirm-delete-risk">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={riskConfirmOpen} onOpenChange={(open) => { setRiskConfirmOpen(open); if (!open) setForceRecalculate(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-risk-confirm-title">Generate Risk Assessment</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-risk-confirm-description">
              This will use AI to analyze your portfolio and generate a comprehensive risk assessment report. This may take a few seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-risk-confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                generateRiskAssessment.mutate({ force: forceRecalculate });
                setForceRecalculate(false);
              }}
              disabled={generateRiskAssessment.isPending}
              data-testid="button-risk-confirm-generate"
            >
              {generateRiskAssessment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Report
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-risk-dialog-title">
              <Shield className="h-5 w-5" />
              Portfolio Risk Assessment
            </DialogTitle>
            <DialogDescription data-testid="text-risk-dialog-description">
              AI-powered risk analysis for {portfolioName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-2">
            {riskReport && (
              <div className="space-y-6 pb-4">
                <div className={cn("rounded-lg p-6 text-center", getRiskScoreBg(riskReport.riskScore || 0))} data-testid="display-risk-score">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Overall Risk Score</p>
                  <p className={cn("text-5xl font-bold", getRiskScoreColor(riskReport.riskScore || 0))} data-testid="text-risk-score-value">
                    {riskReport.riskScore}
                  </p>
                  <p className={cn("text-sm font-medium mt-1", getRiskScoreColor(riskReport.riskScore || 0))} data-testid="text-risk-score-label">
                    {getRiskScoreLabel(riskReport.riskScore || 0)}
                  </p>
                </div>

                {riskReport.summary && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground" data-testid="text-risk-summary">{riskReport.summary}</p>
                    </CardContent>
                  </Card>
                )}

                {riskReport.categories && riskReport.categories.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Risk Categories</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3" data-testid="display-risk-categories">
                        {riskReport.categories.map((cat: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-4" data-testid={`risk-category-${idx}`}>
                            <span className="text-sm font-medium flex-1">{cat.name}</span>
                            <div className="flex items-center gap-2">
                              <Progress value={cat.score} className="w-24 h-2" />
                              <span className={cn("text-sm font-semibold w-8 text-right", getRiskScoreColor(cat.score))}>
                                {cat.score}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {riskReport.topRisks && riskReport.topRisks.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Top Risks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3" data-testid="display-top-risks">
                        {riskReport.topRisks.map((risk: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`top-risk-${idx}`}>
                            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{risk.title || risk.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">{risk.description || risk.detail}</p>
                              {risk.impact && (
                                <Badge className="mt-2 text-xs">{risk.impact}</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(riskReport.financialRisk || riskReport.scheduleRisk) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {riskReport.financialRisk && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Financial Risk
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div data-testid="display-financial-risk">
                            {typeof riskReport.financialRisk === "string" ? (
                              <p className="text-sm text-muted-foreground">{riskReport.financialRisk}</p>
                            ) : (
                              <>
                                {riskReport.financialRisk.score !== undefined && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm text-muted-foreground">Score:</span>
                                    <span className={cn("text-sm font-semibold", getRiskScoreColor(riskReport.financialRisk.score))}>
                                      {riskReport.financialRisk.score}
                                    </span>
                                  </div>
                                )}
                                <p className="text-sm text-muted-foreground">{riskReport.financialRisk.analysis || riskReport.financialRisk.description}</p>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {riskReport.scheduleRisk && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Schedule Risk
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div data-testid="display-schedule-risk">
                            {typeof riskReport.scheduleRisk === "string" ? (
                              <p className="text-sm text-muted-foreground">{riskReport.scheduleRisk}</p>
                            ) : (
                              <>
                                {riskReport.scheduleRisk.score !== undefined && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm text-muted-foreground">Score:</span>
                                    <span className={cn("text-sm font-semibold", getRiskScoreColor(riskReport.scheduleRisk.score))}>
                                      {riskReport.scheduleRisk.score}
                                    </span>
                                  </div>
                                )}
                                <p className="text-sm text-muted-foreground">{riskReport.scheduleRisk.analysis || riskReport.scheduleRisk.description}</p>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {riskReport.recommendations && riskReport.recommendations.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2" data-testid="display-recommendations">
                        {riskReport.recommendations.map((rec: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`recommendation-${idx}`}>
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                            <p className="text-sm">{typeof rec === "string" ? rec : rec.text || rec.description || rec.title}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0 flex-row flex-wrap gap-2 pt-4 border-t">
            {riskAssessmentId && (
              <Button
                variant="outline"
                onClick={() => {
                  window.open(`/api/portfolios/${portfolioId}/risk-assessment/${riskAssessmentId}/pdf`, "_blank");
                }}
                data-testid="button-risk-download-pdf"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            )}
            {riskShareToken && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.open(`/risk-assessment/share/${riskShareToken}`, "_blank");
                  }}
                  data-testid="button-risk-open-tab"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in New Tab
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/risk-assessment/share/${riskShareToken}`);
                    toast({
                      title: "Link Copied",
                      description: "Share link has been copied to clipboard.",
                    });
                  }}
                  data-testid="button-risk-copy-share"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Copy Share Link
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => setRiskDialogOpen(false)}
              data-testid="button-risk-dialog-close"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RiskScoreTrendChart({ portfolioId, getRiskScoreColor }: {
  portfolioId: number;
  getRiskScoreColor: (score: number) => string;
}) {
  const { data: history } = useQuery<{ id: number; riskScore: number; generatedAt: string }[]>({
    queryKey: ["/api/portfolios", portfolioId, "risk-assessment", "history"],
  });

  if (!history || history.length < 2) return null;

  const chartData = history.map((item) => ({
    date: format(new Date(item.generatedAt), "MMM d"),
    fullDate: format(new Date(item.generatedAt), "MMM d, yyyy"),
    score: item.riskScore,
  }));

  const latestScore = chartData[chartData.length - 1].score;
  const previousScore = chartData[chartData.length - 2].score;
  const scoreDelta = latestScore - previousScore;

  return (
    <Card data-testid="card-risk-trend">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Risk Score Trend
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn("text-lg font-bold", getRiskScoreColor(latestScore))}>
              {latestScore}
            </span>
            {scoreDelta !== 0 && (
              <Badge className={cn("text-xs", scoreDelta > 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300")}>
                {scoreDelta > 0 ? "+" : ""}{scoreDelta} pts
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>{history.length} assessments tracked</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-48" data-testid="display-risk-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const score = d.score as number;
                  return (
                    <div className="bg-popover border rounded-md p-2 shadow-md">
                      <p className="text-xs text-muted-foreground">{d.fullDate}</p>
                      <p className={cn("text-sm font-bold", getRiskScoreColor(score))}>
                        Score: {score}
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={30} stroke="hsl(var(--chart-2))" strokeDasharray="3 3" label={{ value: "Low", position: "right", fontSize: 10 }} />
              <ReferenceLine y={60} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" label={{ value: "Medium", position: "right", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesTab({ portfolioId }: { portfolioId: number }) {
  const { data: issues, isLoading, refetch } = usePortfolioIssues(portfolioId);
  const [editingIssue, setEditingIssue] = useState<PortfolioIssue | null>(null);
  const [deleteIssue, setDeleteIssue] = useState<PortfolioIssue | null>(null);
  const updateIssue = useUpdateIssue();
  const deleteIssueMutation = useDeleteIssue();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const editForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      type: "Bug",
      priority: "Medium",
      status: "Open",
      dueDate: "",
      impactCost: "",
    }
  });

  useEffect(() => {
    if (editingIssue) {
      editForm.reset({
        title: editingIssue.title || "",
        description: editingIssue.description || "",
        type: editingIssue.type || "Bug",
        priority: editingIssue.priority || "Medium",
        status: editingIssue.status || "Open",
        dueDate: editingIssue.dueDate ? editingIssue.dueDate.split("T")[0] : "",
        impactCost: editingIssue.impactCost ? String(editingIssue.impactCost) : "",
      });
    }
  }, [editingIssue]);

  const onEditSubmit = async (data: any) => {
    if (!editingIssue) return;
    const submitData = { ...data };
    if (!submitData.dueDate) delete submitData.dueDate;
    if (!submitData.impactCost) delete submitData.impactCost;
    try {
      await updateIssue.mutateAsync({ id: editingIssue.id, projectId: editingIssue.projectId, ...submitData });
      toast({ title: "Success", description: "Issue updated successfully" });
      setEditingIssue(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteIssue) return;
    try {
      await deleteIssueMutation.mutateAsync({ id: deleteIssue.id, projectId: deleteIssue.projectId });
      toast({ title: "Success", description: "Issue deleted successfully" });
      setDeleteIssue(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  const allIssues = issues?.filter((issue: PortfolioIssue) => issue.itemType !== 'risk') || [];
  const escalatedIssues = allIssues.filter((issue: PortfolioIssue) => issue.escalatedToPortfolio);

  const priorityColors: Record<string, string> = {
    Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    High: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };

  const statusColors: Record<string, string> = {
    Open: "bg-destructive/10 text-destructive",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    Resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    Closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-rose-600" />
            Portfolio Issues
          </CardTitle>
          <CardDescription>All issues from projects in this portfolio ({allIssues.length} total, {escalatedIssues.length} escalated)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Issue</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground hidden sm:table-cell">Project</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Type</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Priority</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Assignee</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {allIssues.map((issue: PortfolioIssue) => (
                  <tr 
                    key={issue.id} 
                    className="border-b hover:bg-muted/30 transition-colors cursor-pointer group" 
                    data-testid={`row-issue-${issue.id}`}
                    onClick={() => setEditingIssue(issue)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {issue.escalatedToPortfolio && (
                          <ArrowUpToLine className="h-4 w-4 text-rose-600 flex-shrink-0" title="Escalated to Portfolio" />
                        )}
                        <div>
                          <p className="font-medium hover:text-primary">{issue.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">{issue.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/projects/${issue.projectId}`}>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">{issue.projectName}</Badge>
                      </Link>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <Badge variant="secondary" className="text-xs">{issue.type}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={cn("text-xs", priorityColors[issue.priority || "Medium"])}>{issue.priority}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={cn("text-xs", statusColors[issue.status || "Open"])}>{issue.status}</Badge>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell">{issue.assignee || "-"}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" data-testid={`menu-issue-${issue.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingIssue(issue)} data-testid={`edit-issue-${issue.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteIssue(issue)} className="text-red-600" data-testid={`delete-issue-${issue.id}`}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allIssues.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No issues found in projects within this portfolio.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingIssue} onOpenChange={(open) => !open && setEditingIssue(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Issue</DialogTitle>
            <DialogDescription>Update issue details</DialogDescription>
          </DialogHeader>
          {editingIssue && (
            <div className="text-sm text-muted-foreground border-b pb-3 mb-3">
              <span>Project: </span>
              <Link href={`/projects/${editingIssue.projectId}`} className="text-primary hover:underline font-medium">
                {editingIssue.projectName}
              </Link>
            </div>
          )}
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input {...editForm.register("title")} data-testid="input-edit-issue-title" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Controller
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-edit-issue-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bug">Bug</SelectItem>
                        <SelectItem value="Enhancement">Enhancement</SelectItem>
                        <SelectItem value="Task">Task</SelectItem>
                        <SelectItem value="Question">Question</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Controller
                  control={editForm.control}
                  name="priority"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-edit-issue-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-edit-issue-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Resolved">Resolved</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" {...editForm.register("dueDate")} data-testid="input-edit-issue-due-date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cost Exposure ($)</Label>
              <Input type="number" min="0" step="0.01" {...editForm.register("impactCost")} data-testid="input-edit-issue-cost-exposure" placeholder="$ amount" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...editForm.register("description")} data-testid="input-edit-issue-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingIssue(null)}>Cancel</Button>
              <Button type="submit" disabled={updateIssue.isPending} data-testid="button-update-issue">
                {updateIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Issue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteIssue} onOpenChange={(open) => !open && setDeleteIssue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Issue</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteIssue?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" data-testid="button-confirm-delete-issue">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PortfolioTasksTab({ portfolioId, organizationId }: { portfolioId: number; organizationId: number }) {
  const BATCH_SIZE = 5;
  const { data: projects, isLoading: projectsLoading } = usePortfolioProjects(portfolioId);
  const [view, setView] = useState<"table" | "gantt">("gantt");
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loadedProjectIds, setLoadedProjectIds] = useState<Set<number>>(new Set());

  const projectIds = useMemo(() => (projects || []).map(p => p.id), [projects]);

  const prevPortfolioIdRef = useRef(portfolioId);
  useEffect(() => {
    if (prevPortfolioIdRef.current !== portfolioId) {
      prevPortfolioIdRef.current = portfolioId;
      setVisibleCount(BATCH_SIZE);
      setLoadedProjectIds(new Set());
      setTasksByProject({});
      setInitialLoading(true);
      setExpandedProjects(new Set());
    }
  }, [portfolioId]);

  const visibleProjectIds = useMemo(() => projectIds.slice(0, visibleCount), [projectIds, visibleCount]);

  const idsToFetch = useMemo(() => {
    const newIds = visibleProjectIds.filter(id => !loadedProjectIds.has(id));
    return newIds.length > 0 ? newIds : [];
  }, [visibleProjectIds, loadedProjectIds]);

  const [tasksByProject, setTasksByProject] = useState<Record<number, Task[]>>({});
  const [isFetchingBatch, setIsFetchingBatch] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (idsToFetch.length === 0) {
      if (initialLoading && projectIds.length > 0 && Object.keys(tasksByProject).length > 0) {
        setInitialLoading(false);
      } else if (projectIds.length === 0) {
        setInitialLoading(false);
      }
      return;
    }
    let cancelled = false;
    setIsFetchingBatch(true);

    Promise.all(
      idsToFetch.map(async (pid) => {
        const res = await fetch(`/api/projects/${pid}/tasks`);
        const tasks = res.ok ? await res.json() : [];
        return { pid, tasks } as { pid: number; tasks: Task[] };
      })
    ).then((results) => {
      if (cancelled) return;
      setTasksByProject(prev => {
        const next = { ...prev };
        results.forEach(({ pid, tasks }) => { next[pid] = tasks; });
        return next;
      });
      setLoadedProjectIds(prev => {
        const next = new Set(prev);
        results.forEach(({ pid }) => next.add(pid));
        return next;
      });
      setIsFetchingBatch(false);
      setInitialLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error('Error fetching portfolio tasks:', err);
      setIsFetchingBatch(false);
      setInitialLoading(false);
    });

    return () => { cancelled = true; };
  }, [idsToFetch]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !projects) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < projectIds.length && !isFetchingBatch) {
          setVisibleCount(prev => Math.min(prev + BATCH_SIZE, projectIds.length));
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [projects, visibleCount, projectIds.length, isFetchingBatch]);

  const visibleProjects = useMemo(() => (projects || []).slice(0, visibleCount), [projects, visibleCount]);

  const totalTasks = useMemo(() => {
    return Object.values(tasksByProject).reduce((sum, tasks) => sum + tasks.length, 0);
  }, [tasksByProject]);

  const completedTasks = useMemo(() => {
    return Object.values(tasksByProject).reduce((sum, tasks) =>
      sum + tasks.filter(t => t.status === "Completed").length, 0
    );
  }, [tasksByProject]);

  useEffect(() => {
    if (projects && expandedProjects.size === 0) {
      setExpandedProjects(new Set(projects.map(p => p.id)));
    }
  }, [projects]);

  const toggleProject = (pid: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  if (projectsLoading || initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No projects in this portfolio yet.</p>
        </CardContent>
      </Card>
    );
  }

  const hasMore = visibleCount < projectIds.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Portfolio Tasks</h3>
          <Badge variant="secondary" className="text-xs">
            {completedTasks}/{totalTasks} completed
          </Badge>
          {hasMore && (
            <span className="text-xs text-muted-foreground">
              Showing {visibleProjects.length} of {projects.length} projects
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("table")}
          >
            <List className="h-4 w-4 mr-1" />
            Table
          </Button>
          <Button
            variant={view === "gantt" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("gantt")}
          >
            <GanttChart className="h-4 w-4 mr-1" />
            Gantt
          </Button>
        </div>
      </div>

      {visibleProjects.map((project) => {
        const tasks = tasksByProject[project.id] || [];
        const isLoaded = loadedProjectIds.has(project.id);
        const isExpanded = expandedProjects.has(project.id);
        const completed = tasks.filter(t => t.status === "Completed").length;
        const healthColor = project.health === "Green" ? "bg-emerald-500" : project.health === "Yellow" ? "bg-amber-500" : project.health === "Red" ? "bg-rose-500" : "bg-slate-400";

        return (
          <Card key={project.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-b"
              onClick={() => toggleProject(project.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${healthColor}`} />
                <Link
                  href={`/projects/${project.id}`}
                  className="font-semibold text-sm hover:underline"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {project.name}
                </Link>
                {isLoaded ? (
                  <>
                    <Badge variant="outline" className="text-[10px]">
                      {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                    </Badge>
                    {tasks.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {completed}/{tasks.length} completed
                      </span>
                    )}
                  </>
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-90" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground rotate-90" />
                )}
              </div>
            </div>

            {isExpanded && isLoaded && tasks.length > 0 && (
              <div className="border-t">
                <ProjectGanttView
                  tasks={tasks}
                  onTaskClick={(task) => setSelectedTask(task)}
                  projectId={project.id}
                  organizationId={organizationId}
                  onCreateTask={() => {}}
                  projectName={project.name}
                  projectStartDate={project.startDate}
                  projectEndDate={project.endDate}
                  hideTimeline={view === "table"}
                  isReadOnly={true}
                />
              </div>
            )}
            {isExpanded && isLoaded && tasks.length === 0 && (
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                No tasks in this project.
              </CardContent>
            )}
            {isExpanded && !isLoaded && (
              <CardContent className="py-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            )}
          </Card>
        );
      })}

      {hasMore && <div ref={sentinelRef} className="h-1" />}
      {isFetchingBatch && hasMore && (
        <div className="flex items-center justify-center py-4 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading more projects...</span>
        </div>
      )}

      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) setSelectedTask(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedTask.name}</DialogTitle>
              <DialogDescription>
                Task details (read-only from portfolio view)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">Status</span>
                  <div className="font-medium">{selectedTask.status}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Priority</span>
                  <div className="font-medium">{selectedTask.priority || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Start Date</span>
                  <div className="font-medium">{selectedTask.startDate || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">End Date</span>
                  <div className="font-medium">{selectedTask.endDate || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Progress</span>
                  <div className="flex items-center gap-2">
                    <Progress value={selectedTask.progress || 0} className="flex-1 h-2" />
                    <span className="font-medium text-xs">{selectedTask.progress || 0}%</span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Assignee</span>
                  <div className="font-medium">{selectedTask.assignee || "Unassigned"}</div>
                </div>
              </div>
              {selectedTask.description && (
                <div>
                  <span className="text-muted-foreground text-xs">Description</span>
                  <p className="mt-1">{selectedTask.description}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Link href={`/projects/${selectedTask.projectId}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in Project
                </Button>
              </Link>
              <Button variant="default" size="sm" onClick={() => setSelectedTask(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const KEY_DATE_TYPES = ["Deadline", "Governance", "Deliverable", "Phase Gate", "External", "Payment", "Review", "Go Live", "Other"] as const;
const KEY_DATE_STATUSES = ["Upcoming", "At Risk", "Overdue", "Completed"] as const;

function KeyDatesTab({ portfolioId }: { portfolioId: number }) {
  const { data: keyDates, isLoading } = usePortfolioKeyDates(portfolioId);
  const createMutation = useCreatePortfolioKeyDate(portfolioId);
  const updateMutation = useUpdatePortfolioKeyDate(portfolioId);
  const deleteMutation = useDeletePortfolioKeyDate(portfolioId);
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKeyDate, setEditingKeyDate] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<"title" | "keyDateType" | "date" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  const handleSort = (field: "title" | "keyDateType" | "date" | "status") => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const startInlineEdit = (kd: any, field: string) => {
    setEditingCell({ id: kd.id, field });
    if (field === "date") {
      setEditingValue(kd.date ? kd.date.split("T")[0] : "");
    } else {
      setEditingValue(kd[field] || "");
    }
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    try {
      await updateMutation.mutateAsync({ id, [field]: editingValue });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
    setEditingCell(null);
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); saveInlineEdit(); }
    if (e.key === "Escape") { cancelInlineEdit(); }
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    keyDateType: "Deadline",
    date: "",
    status: "Upcoming",
    notes: "",
  });

  const resetForm = () => {
    setFormData({ title: "", description: "", keyDateType: "Deadline", date: "", status: "Upcoming", notes: "" });
    setEditingKeyDate(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (kd: any) => {
    setEditingKeyDate(kd);
    setFormData({
      title: kd.title || "",
      description: kd.description || "",
      keyDateType: kd.keyDateType || "Deadline",
      date: kd.date ? kd.date.split("T")[0] : "",
      status: kd.status || "Upcoming",
      notes: kd.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.date) {
      toast({ title: "Title and date are required", variant: "destructive" });
      return;
    }
    try {
      if (editingKeyDate) {
        await updateMutation.mutateAsync({ id: editingKeyDate.id, ...formData });
        toast({ title: "Key date updated" });
      } else {
        await createMutation.mutateAsync(formData);
        toast({ title: "Key date created" });
      }
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: "Failed to save key date", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Key date deleted" });
      setDeleteConfirmId(null);
    } catch {
      toast({ title: "Failed to delete key date", variant: "destructive" });
    }
  };

  const handleToggleComplete = async (kd: any) => {
    const newCompleted = !kd.completed;
    await updateMutation.mutateAsync({
      id: kd.id,
      completed: newCompleted,
      status: newCompleted ? "Completed" : "Upcoming",
    });
  };

  const filteredKeyDates = useMemo(() => {
    if (!keyDates) return [];
    let filtered = [...keyDates];
    if (searchQuery) {
      const q = normalizeSearch(searchQuery);
      filtered = filtered.filter(kd => 
        normalizeSearch(kd.title || "").includes(q) || 
        normalizeSearch(kd.description || "").includes(q)
      );
    }
    if (filterType !== "all") {
      filtered = filtered.filter(kd => kd.keyDateType === filterType);
    }
    if (filterStatus !== "all") {
      filtered = filtered.filter(kd => kd.status === filterStatus);
    }
    const statusOrder: Record<string, number> = { "Overdue": 0, "At Risk": 1, "Upcoming": 2, "Completed": 3 };
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = (a.title || "").localeCompare(b.title || "");
      } else if (sortField === "keyDateType") {
        cmp = (a.keyDateType || "").localeCompare(b.keyDateType || "");
      } else if (sortField === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === "status") {
        cmp = (statusOrder[a.status || "Upcoming"] ?? 2) - (statusOrder[b.status || "Upcoming"] ?? 2);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [keyDates, searchQuery, filterType, filterStatus, sortField, sortDir]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Key Dates</CardTitle>
              <CardDescription>Portfolio-level key dates and deadlines</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Key Date</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search key dates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[120px] sm:w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {KEY_DATE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[120px] sm:w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {KEY_DATE_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 w-10"></th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">
                    <button onClick={() => handleSort("title")} className="flex items-center hover:text-foreground transition-colors">
                      Key Date <SortIcon field="title" />
                    </button>
                  </th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    <button onClick={() => handleSort("keyDateType")} className="flex items-center hover:text-foreground transition-colors">
                      Type <SortIcon field="keyDateType" />
                    </button>
                  </th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">
                    <button onClick={() => handleSort("date")} className="flex items-center hover:text-foreground transition-colors">
                      Date <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="p-3 text-left text-sm font-medium text-muted-foreground">
                    <button onClick={() => handleSort("status")} className="flex items-center hover:text-foreground transition-colors">
                      Status <SortIcon field="status" />
                    </button>
                  </th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredKeyDates.map((kd) => {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const dateVal = new Date(kd.date);
                  const diffDays = Math.round((dateVal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = !kd.completed && diffDays < 0;

                  const statusColorMap: Record<string, string> = {
                    Upcoming: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                    "At Risk": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                    Overdue: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
                    Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                  };

                  const isEditingThis = (field: string) => editingCell?.id === kd.id && editingCell?.field === field;

                  return (
                    <tr key={kd.id} className={cn("border-b hover:bg-muted/30 transition-colors", kd.completed && "opacity-60")}>
                      <td className="p-3">
                        <Checkbox
                          checked={!!kd.completed}
                          onCheckedChange={() => handleToggleComplete(kd)}
                        />
                      </td>
                      <td className="p-3 max-w-[250px]">
                        {isEditingThis("title") ? (
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleInlineKeyDown}
                            autoFocus
                            className="h-8 text-sm"
                          />
                        ) : (
                          <div className="cursor-pointer group min-w-0" onDoubleClick={() => startInlineEdit(kd, "title")}>
                            <p className={cn("font-medium truncate group-hover:text-primary", kd.completed && "line-through")}>{kd.title}</p>
                            {kd.description && (
                              <p className="text-sm text-muted-foreground truncate">{kd.description}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        {isEditingThis("keyDateType") ? (
                          <Select value={editingValue} onValueChange={(v) => { setEditingValue(v); setTimeout(() => { updateMutation.mutateAsync({ id: kd.id, keyDateType: v }).catch(() => toast({ title: "Failed to update", variant: "destructive" })); setEditingCell(null); }, 0); }}>
                            <SelectTrigger className="h-8 text-xs w-[130px]" autoFocus>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KEY_DATE_TYPES.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-xs cursor-pointer hover:border-primary" onDoubleClick={() => startInlineEdit(kd, "keyDateType")}>{kd.keyDateType}</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {isEditingThis("date") ? (
                          <Input
                            type="date"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveInlineEdit}
                            onKeyDown={handleInlineKeyDown}
                            autoFocus
                            className="h-8 text-sm w-[150px]"
                          />
                        ) : (
                          <div className="cursor-pointer group" onDoubleClick={() => startInlineEdit(kd, "date")}>
                            <span className={cn("text-sm group-hover:text-primary", isOverdue && "text-rose-500 font-medium")}>
                              {format(dateVal, "MMM d, yyyy")}
                            </span>
                            {!kd.completed && (
                              <p className={cn("text-xs", isOverdue ? "text-rose-500" : diffDays <= 7 ? "text-amber-500" : "text-muted-foreground")}>
                                {isOverdue ? `${Math.abs(diffDays)}d overdue` : diffDays === 0 ? "Today" : `In ${diffDays}d`}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {isEditingThis("status") ? (
                          <Select value={editingValue} onValueChange={(v) => { setEditingValue(v); setTimeout(() => { updateMutation.mutateAsync({ id: kd.id, status: v, completed: v === "Completed" }).catch(() => toast({ title: "Failed to update", variant: "destructive" })); setEditingCell(null); }, 0); }}>
                            <SelectTrigger className="h-8 text-xs w-[130px]" autoFocus>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KEY_DATE_STATUSES.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={cn("text-xs cursor-pointer hover:ring-2 hover:ring-primary/30", statusColorMap[kd.status || "Upcoming"] || "bg-muted")} onDoubleClick={() => startInlineEdit(kd, "status")}>
                            {kd.status}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(kd)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => setDeleteConfirmId(kd.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredKeyDates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {keyDates?.length === 0 
                  ? "No key dates yet. Click \"Add Key Date\" to track important deadlines and milestones."
                  : "No key dates match your filters."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingKeyDate ? "Edit Key Date" : "Add Key Date"}</DialogTitle>
            <DialogDescription>
              {editingKeyDate ? "Update the portfolio key date details." : "Create a new portfolio-level key date."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Phase 1 Go-Live"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={formData.keyDateType} onValueChange={(v) => setFormData(f => ({ ...f, keyDateType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KEY_DATE_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData(f => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KEY_DATE_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingKeyDate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Key Date</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this key date? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardTab({ portfolioId, metrics, onNavigate, financialBudgets }: { 
  portfolioId: number; 
  metrics: any;
  onNavigate: (tab: string) => void;
  financialBudgets?: Record<number, number>;
}) {
  const { data: projects } = usePortfolioProjects(portfolioId);
  const { data: risks } = usePortfolioRisks(portfolioId);
  const { data: keyDates } = usePortfolioKeyDates(portfolioId);

  const healthData = [
    { name: "Healthy", value: metrics.healthCounts.green, color: "#10b981" },
    { name: "At Risk", value: metrics.healthCounts.yellow, color: "#f59e0b" },
    { name: "Critical", value: metrics.healthCounts.red, color: "#ef4444" },
  ].filter(d => d.value > 0);

  // Build heat map data: Status x Health matrix
  const statuses = ["Initiation", "Planning", "Execution", "Monitoring", "Closing", "Billing"];
  const healths = ["Green", "Yellow", "Red"];
  const healthLabels: Record<string, string> = { Green: "Healthy", Yellow: "At Risk", Red: "Critical" };
  
  const heatMapData = statuses.map(status => {
    const row: Record<string, number | string> = { status };
    healths.forEach(health => {
      row[health] = projects?.filter(p => p.status === status && p.health === health).length || 0;
    });
    return row;
  });

  const getHeatMapCellColor = (value: number, health: string) => {
    if (value === 0) return "bg-muted/30 dark:bg-muted/20";
    const intensity = Math.min(value, 5); // Cap intensity at 5 for color calculation
    if (health === "Green") {
      return intensity >= 3 ? "bg-emerald-500 text-white" : intensity >= 2 ? "bg-emerald-400 text-white" : "bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100";
    }
    if (health === "Yellow") {
      return intensity >= 3 ? "bg-amber-500 text-white" : intensity >= 2 ? "bg-amber-400 text-amber-900" : "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100";
    }
    if (health === "Red") {
      return intensity >= 3 ? "bg-rose-600 text-white" : intensity >= 2 ? "bg-rose-500 text-white" : "bg-rose-200 text-rose-900 dark:bg-rose-800 dark:text-rose-100";
    }
    return "bg-muted/50";
  };

  const projectBudgetData = projects?.slice(0, 5).map(p => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
    budget: financialBudgets && p.id in financialBudgets ? financialBudgets[p.id] : Number(p.budget),
    completion: p.completionPercentage || 0,
  })) || [];

  const riskMatrixData = risks?.reduce((acc, r) => {
    const key = `${r.probability}-${r.impact}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const upcomingKeyDates = keyDates?.filter(kd => !kd.completed)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
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
                <p className="text-sm text-muted-foreground">Avg Progress</p>
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
                    <XAxis type="number" tickFormatter={(v) => formatCurrency(v, { autoCompact: true })} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value, { autoCompact: true })} />
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

      <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate("projects")} data-testid="dashboard-heat-map">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Project Status Heat Map
          </CardTitle>
          <CardDescription>Distribution of projects by lifecycle stage and health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                  {healths.map(health => (
                    <th key={health} className="p-2 text-center text-xs font-medium text-muted-foreground">
                      {healthLabels[health]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatMapData.map(row => (
                  <tr key={row.status as string} data-testid={`heatmap-row-${row.status}`}>
                    <td className="p-2 text-sm font-medium">{row.status}</td>
                    {healths.map(health => {
                      const value = row[health] as number;
                      return (
                        <td key={health} className="p-1">
                          <div 
                            className={cn(
                              "rounded-md p-3 text-center text-sm font-semibold transition-colors",
                              getHeatMapCellColor(value, health)
                            )}
                            data-testid={`heatmap-cell-${row.status}-${health}`}
                          >
                            {value}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="font-medium">Intensity:</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-muted/30 dark:bg-muted/20" />
              <span>None</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-slate-300 dark:bg-slate-600" />
              <span>Low (1-2)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-slate-400 dark:bg-slate-500" />
              <span>Medium (3-4)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-slate-600 dark:bg-slate-300" />
              <span>High (5+)</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
              Upcoming Key Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingKeyDates.map(kd => (
                <div key={kd.id} className="flex items-center justify-between p-2 rounded-lg border" data-testid={`key-date-${kd.id}`}>
                  <div>
                    <p className="font-medium text-sm">{kd.title}</p>
                    {kd.keyDateType && (
                      <p className="text-xs text-muted-foreground">{kd.keyDateType}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {format(new Date(kd.date), 'MMM d')}
                  </Badge>
                </div>
              ))}
              {upcomingKeyDates.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No upcoming key dates
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const priorityColors = {
  Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  High: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const statusColors = {
  Open: "bg-destructive/10 text-destructive",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const aggregationMethodLabels: Record<string, string> = {
  'average': 'Average',
  'sum': 'Sum',
  'max': 'Maximum',
  'min': 'Minimum',
  'weighted-average': 'Weighted Average (by Budget)',
};

function PortfolioScoringTab({ portfolioId }: { portfolioId: number }) {
  const { data: rollup, isLoading } = usePortfolioScoringRollup(portfolioId);
  const updateConfig = useUpdatePortfolioScoringConfig();
  const { toast } = useToast();
  const [expandedCriteria, setExpandedCriteria] = useState<Set<number>>(new Set());

  const toggleExpanded = (criteriaId: number) => {
    setExpandedCriteria(prev => {
      const next = new Set(prev);
      if (next.has(criteriaId)) next.delete(criteriaId);
      else next.add(criteriaId);
      return next;
    });
  };

  const handleAggregationChange = async (criteriaId: number, method: string) => {
    try {
      await updateConfig.mutateAsync({ portfolioId, criteriaId, aggregationMethod: method });
      toast({ title: "Aggregation method updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update aggregation method", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!rollup) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-slate-50 dark:bg-slate-800 p-4 mb-4">
            <BarChart3 className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium">No Scoring Data</h3>
          <p className="text-muted-foreground mt-1 max-w-sm">
            Unable to load scoring data for this portfolio.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasNoCriteria = rollup.criteria.length === 0;
  const hasKeyDates = rollup.keyDateCompliance && rollup.keyDateCompliance.total > 0;

  if (hasNoCriteria && !hasKeyDates) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-slate-50 dark:bg-slate-800 p-4 mb-4">
            <BarChart3 className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium">No Scoring Criteria</h3>
          <p className="text-muted-foreground mt-1 max-w-sm">
            Define scoring criteria at the organization level first, then score individual projects. Portfolio scores are automatically rolled up from project scores.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score: number | null, max: number) => {
    if (score === null) return "text-muted-foreground";
    const pct = score / max;
    if (pct >= 0.7) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 0.4) return "text-amber-600 dark:text-amber-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getScoreBarColor = (score: number | null, max: number) => {
    if (score === null) return "bg-muted";
    const pct = score / max;
    if (pct >= 0.7) return "bg-emerald-500";
    if (pct >= 0.4) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div className="space-y-6">
      {!hasNoCriteria && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Portfolio Scoring Rollup</CardTitle>
                <CardDescription>
                  Aggregated scores from {rollup.projectCount} project{rollup.projectCount !== 1 ? 's' : ''} in this portfolio
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Overall Weighted Score</div>
                <div className={cn("text-3xl font-bold", getScoreColor(rollup.overallScore, 10))}>
                  {rollup.overallScore !== null ? rollup.overallScore.toFixed(2) : 'N/A'}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {rollup.keyDateCompliance && rollup.keyDateCompliance.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key Date Compliance</CardTitle>
            <CardDescription>
              {rollup.keyDateCompliance.total} key date{rollup.keyDateCompliance.total !== 1 ? 's' : ''} tracked
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{rollup.keyDateCompliance.completed}</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400">{rollup.keyDateCompliance.overdue}</div>
                  <div className="text-xs text-muted-foreground">Overdue</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{rollup.keyDateCompliance.atRisk}</div>
                  <div className="text-xs text-muted-foreground">At Risk</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{rollup.keyDateCompliance.upcoming}</div>
                  <div className="text-xs text-muted-foreground">Upcoming</div>
                </div>
              </div>
            </div>
            {rollup.keyDateCompliance.complianceRate !== null && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">Compliance Rate</span>
                  <span className={cn("text-sm font-bold", rollup.keyDateCompliance.complianceRate >= 70 ? "text-emerald-600 dark:text-emerald-400" : rollup.keyDateCompliance.complianceRate >= 40 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>
                    {rollup.keyDateCompliance.complianceRate}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", rollup.keyDateCompliance.complianceRate >= 70 ? "bg-emerald-500" : rollup.keyDateCompliance.complianceRate >= 40 ? "bg-amber-500" : "bg-rose-500")}
                    style={{ width: `${Math.min(rollup.keyDateCompliance.complianceRate, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!hasNoCriteria && <div className="space-y-4">
        {rollup.criteria.map(criterion => {
          const isExpanded = expandedCriteria.has(criterion.criteriaId);
          const maxScore = criterion.maxScore || 10;
          const barWidth = criterion.aggregatedScore !== null ? (criterion.aggregatedScore / maxScore) * 100 : 0;

          return (
            <Card key={criterion.criteriaId}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{criterion.criteriaName}</h4>
                      {criterion.criteriaCategory && (
                        <Badge variant="secondary" className="text-[10px]">
                          {criterion.criteriaCategory}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Weight: {criterion.criteriaWeight || '1'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {criterion.scoredProjectCount} of {criterion.totalProjectCount} projects scored
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <Select
                      value={criterion.aggregationMethod}
                      onValueChange={(v) => handleAggregationChange(criterion.criteriaId, v)}
                    >
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(aggregationMethodLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className={cn("text-2xl font-bold min-w-[60px] text-right", getScoreColor(criterion.aggregatedScore, maxScore))}>
                      {criterion.aggregatedScore !== null ? criterion.aggregatedScore.toFixed(1) : '—'}
                    </div>
                    <span className="text-sm text-muted-foreground">/ {maxScore}</span>
                  </div>
                </div>

                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", getScoreBarColor(criterion.aggregatedScore, maxScore))}
                    style={{ width: `${Math.min(barWidth, 100)}%` }}
                  />
                </div>

                {criterion.aggregatedScore !== null && (() => {
                  const weight = parseFloat(String(criterion.criteriaWeight)) || 1;
                  const normalized = criterion.aggregatedScore! / maxScore;
                  const totalWeight = rollup.criteria.reduce((sum, c) => sum + (c.aggregatedScore !== null ? (parseFloat(String(c.criteriaWeight)) || 1) : 0), 0);
                  const contributionPct = totalWeight > 0 ? (normalized * weight / totalWeight) * 100 : 0;
                  return (
                    <div className="text-xs text-muted-foreground mb-3">
                      Weighted contribution: {(normalized * weight).toFixed(2)} / {totalWeight.toFixed(1)} ({contributionPct.toFixed(1)}% of overall score)
                    </div>
                  );
                })()}

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => toggleExpanded(criterion.criteriaId)}
                >
                  {isExpanded ? 'Hide' : 'Show'} Project Breakdown
                  {isExpanded ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />}
                </Button>

                {isExpanded && (
                  <div className="mt-3 border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead className="w-[100px] text-center">Score</TableHead>
                          <TableHead className="w-[200px]">Progress</TableHead>
                          <TableHead>Justification</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {criterion.projectBreakdown.map(pb => (
                          <TableRow key={pb.projectId}>
                            <TableCell>
                              <Link href={`/projects/${pb.projectId}`} className="font-medium hover:text-primary transition-colors">
                                {pb.projectName}
                              </Link>
                            </TableCell>
                            <TableCell className="text-center">
                              {pb.score !== null ? (
                                <span className={cn("font-bold", getScoreColor(pb.score, maxScore))}>
                                  {pb.score}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">Not scored</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {pb.score !== null ? (
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
                                  <div
                                    className={cn("h-full rounded-full", getScoreBarColor(pb.score, maxScore))}
                                    style={{ width: `${(pb.score / maxScore) * 100}%` }}
                                  />
                                </div>
                              ) : (
                                <div className="h-1.5 bg-muted rounded-full" />
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground line-clamp-1">
                                {pb.justification || '—'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>}
    </div>
  );
}

