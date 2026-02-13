import { useState, useEffect, useMemo } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { 
  usePortfolioOverview, 
  usePortfolioProjects, 
  usePortfolioRisks, 
  usePortfolioIssues,
  usePortfolioMilestones,
  type PortfolioRisk,
  type PortfolioIssue
} from "@/hooks/use-portfolio-details";
import { useProjects, useUpdateProject } from "@/hooks/use-projects";
import { useUpdateRisk, useDeleteRisk } from "@/hooks/use-risks";
import { useUpdateIssue, useDeleteIssue } from "@/hooks/use-issues";
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
  Calendar, Users, Briefcase, AlertCircle, ChevronLeft, ChevronRight, List, GanttChart, Plus, Search, X,
  Star, Award, FileCheck, Pencil, Trash2, Check, MoreHorizontal, MoreVertical, ArrowUpToLine,
  Shield, Share2, Download, FileText, Sparkles, RefreshCw, ExternalLink
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, startOfMonth, eachDayOfInterval } from "date-fns";
import { cn, normalizeSearch } from "@/lib/utils";
import type { Project } from "@shared/schema";
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

export default function PortfolioDetails() {
  const [, params] = useRoute("/portfolios/:id");
  const id = parseInt(params?.id || "0");
  const { data: overview, isLoading } = usePortfolioOverview(id);
  const [activeTab, setActiveTab] = useState("summary");
  const { currentOrganization } = useOrganization();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskReport, setRiskReport] = useState<any>(null);
  const [riskShareToken, setRiskShareToken] = useState<string>("");
  const [riskAssessmentId, setRiskAssessmentId] = useState<number | null>(null);
  const [riskConfirmOpen, setRiskConfirmOpen] = useState(false);

  const generateRiskAssessment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portfolios/${id}/risk-assessment`);
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate risk assessment. Please try again.",
        variant: "destructive",
      });
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

  const { portfolio, metrics } = overview;

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
          </div>
          <p className="text-muted-foreground mt-1 truncate" title={portfolio.description || ""}>{portfolio.description}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl flex-wrap gap-1 h-auto">
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
            <SummaryTab metrics={metrics} portfolio={portfolio} portfolioId={id} onNavigate={setActiveTab} getRiskScoreColor={getRiskScoreColor} getRiskScoreBg={getRiskScoreBg} getRiskScoreLabel={getRiskScoreLabel} />
          </TabsContent>
          <TabsContent value="projects">
            <ProjectsTab portfolioId={id} organizationId={currentOrganization?.id || 0} isCustom={!!portfolio.isCustom} />
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
          <TabsContent value="dashboard">
            <DashboardTab portfolioId={id} metrics={metrics} onNavigate={setActiveTab} />
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

function ProjectsTab({ portfolioId, organizationId, isCustom }: { portfolioId: number; organizationId: number; isCustom?: boolean }) {
  const { data: projects, isLoading } = usePortfolioProjects(portfolioId);
  const { data: allProjects } = useProjects(organizationId);
  const [view, setView] = useState<"list" | "gantt">("list");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const updateProject = useUpdateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
        await Promise.all(
          selectedProjectIds.map(projectId => 
            apiRequest("POST", `/api/portfolios/${portfolioId}/custom-projects`, { projectId })
          )
        );
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
      <CardHeader className="flex flex-row items-center justify-between gap-4">
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
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            data-testid="button-add-project-to-portfolio"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Project
          </Button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="rounded-none"
              data-testid="button-portfolio-view-list"
            >
              <List className="h-4 w-4 mr-2" />
              List
            </Button>
            <Button
              variant={view === "gantt" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("gantt")}
              className="rounded-none"
              data-testid="button-portfolio-view-gantt"
            >
              <GanttChart className="h-4 w-4 mr-2" />
              Gantt
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === "list" ? (
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
                    <td className="p-3 max-w-[200px]">
                      <Link href={`/projects/${project.id}`}>
                        <div className="hover:text-primary cursor-pointer min-w-0">
                          <p className="font-medium truncate">{project.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                        </div>
                      </Link>
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
                      <div className="flex items-center gap-1">
                        {(() => {
                          const projectIndex = projects?.findIndex((p: Project) => p.id === project.id) ?? -1;
                          const prevProject = projectIndex > 0 ? projects?.[projectIndex - 1] : null;
                          const nextProject = projectIndex < (projects?.length ?? 0) - 1 ? projects?.[projectIndex + 1] : null;
                          return (
                            <>
                              <Link href={prevProject ? `/projects/${prevProject.id}` : "#"}>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  disabled={!prevProject}
                                  className="h-8 w-8"
                                  data-testid={`button-prev-project-${project.id}`}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Link href={nextProject ? `/projects/${nextProject.id}` : "#"}>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  disabled={!nextProject}
                                  className="h-8 w-8"
                                  data-testid={`button-next-project-${project.id}`}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </Link>
                            </>
                          );
                        })()}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-menu-project-${project.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${project.id}`} className="cursor-pointer">
                                <ArrowRight className="h-4 w-4 mr-2" />
                                View Project
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRemoveProject(project.id)}
                              className="text-destructive focus:text-destructive"
                              data-testid={`menu-delete-project-${project.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove from Portfolio
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {projects?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No projects in this portfolio. Click "Add Project" to add existing projects.
              </div>
            )}
          </div>
        ) : (
          <PortfolioProjectsGanttView projects={projects || []} />
        )}
      </CardContent>
    </Card>

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

          <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-md overflow-x-hidden">
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
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors overflow-hidden",
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
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-medium truncate">{project.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{project.description || "No description"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">{project.status}</Badge>
                      {project.health && (
                        <Badge className={cn("text-xs", healthColors[project.health])}>{project.health}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

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

function RisksTab({ portfolioId, portfolioName, onRiskAssessmentClick, onRecalculateRisk, generateRiskAssessment, riskConfirmOpen, setRiskConfirmOpen, riskDialogOpen, setRiskDialogOpen, riskReport, riskAssessmentId, riskShareToken, getRiskScoreColor, getRiskScoreBg, getRiskScoreLabel }: {
  portfolioId: number;
  portfolioName: string;
  onRiskAssessmentClick: () => void;
  onRecalculateRisk: () => void;
  generateRiskAssessment: any;
  riskConfirmOpen: boolean;
  setRiskConfirmOpen: (open: boolean) => void;
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
  const [editingRisk, setEditingRisk] = useState<PortfolioRisk | null>(null);
  const [deleteRisk, setDeleteRisk] = useState<PortfolioRisk | null>(null);
  const updateRisk = useUpdateRisk();
  const deleteRiskMutation = useDeleteRisk();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const recentAssessment = useMemo(() => {
    if (!latestAssessment?.riskScore || !latestAssessment?.generatedAt) return null;
    const generatedAt = new Date(latestAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt > tenDaysAgo) return { score: latestAssessment.riskScore, generatedAt };
    return null;
  }, [latestAssessment]);

  const editForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "",
    }
  });

  useEffect(() => {
    if (editingRisk) {
      editForm.reset({
        title: editingRisk.title || "",
        description: editingRisk.description || "",
        probability: editingRisk.probability || "Medium",
        impact: editingRisk.impact || "Medium",
        status: editingRisk.status || "Open",
        mitigationPlan: editingRisk.mitigationPlan || "",
      });
    }
  }, [editingRisk]);

  const onEditSubmit = async (data: any) => {
    if (!editingRisk) return;
    try {
      await updateRisk.mutateAsync({ id: editingRisk.id, projectId: editingRisk.projectId, ...data });
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Portfolio Risks
              </CardTitle>
              <CardDescription className="mt-1">All risks from projects in this portfolio ({allRisks.length} total, {escalatedRisks.length} escalated)</CardDescription>
            </div>
            <div className="flex items-center gap-3">
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
                  onClick={onRiskAssessmentClick}
                  disabled={generateRiskAssessment.isPending}
                  data-testid="button-risk-assessment"
                >
                  {generateRiskAssessment.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  AI Risk Assessment
                </Button>
              )}
            </div>
          </div>
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
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
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

      <Dialog open={!!editingRisk} onOpenChange={(open) => !open && setEditingRisk(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Risk</DialogTitle>
            <DialogDescription>Update risk details</DialogDescription>
          </DialogHeader>
          {editingRisk && (
            <div className="text-sm text-muted-foreground border-b pb-3 mb-3">
              <span>Project: </span>
              <Link href={`/projects/${editingRisk.projectId}`} className="text-primary hover:underline font-medium">
                {editingRisk.projectName}
              </Link>
            </div>
          )}
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input {...editForm.register("title")} data-testid="input-edit-risk-title" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Probability</Label>
                <Controller
                  control={editForm.control}
                  name="probability"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-edit-probability">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Impact</Label>
                <Controller
                  control={editForm.control}
                  name="impact"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-edit-impact">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Controller
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger data-testid="select-edit-risk-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Mitigated">Mitigated</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...editForm.register("description")} data-testid="input-edit-risk-description" />
            </div>
            <div className="space-y-2">
              <Label>Mitigation Plan</Label>
              <Textarea {...editForm.register("mitigationPlan")} data-testid="input-edit-risk-mitigation" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingRisk(null)}>Cancel</Button>
              <Button type="submit" disabled={updateRisk.isPending} data-testid="button-update-risk">
                {updateRisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Risk
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={riskConfirmOpen} onOpenChange={setRiskConfirmOpen}>
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
              onClick={() => generateRiskAssessment.mutate()}
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-risk-dialog-title">
              <Shield className="h-5 w-5" />
              Portfolio Risk Assessment
            </DialogTitle>
            <DialogDescription data-testid="text-risk-dialog-description">
              AI-powered risk analysis for {portfolioName}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
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
          </ScrollArea>
          <DialogFooter className="flex-row flex-wrap gap-2 pt-4 border-t">
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
      });
    }
  }, [editingIssue]);

  const onEditSubmit = async (data: any) => {
    if (!editingIssue) return;
    try {
      await updateIssue.mutateAsync({ id: editingIssue.id, projectId: editingIssue.projectId, ...data });
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
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/projects/${issue.projectId}`}>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">{issue.projectName}</Badge>
                      </Link>
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

