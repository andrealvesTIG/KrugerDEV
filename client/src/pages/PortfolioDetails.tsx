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
  Calendar, Users, Briefcase, AlertCircle, ChevronLeft, List, GanttChart, Plus, Search, X,
  Star, Award, FileCheck, Pencil, Trash2, Check, MoreHorizontal
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, startOfMonth, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schema";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useScoringCriteria, useCreateScoringCriteria, useUpdateScoringCriteria, useDeleteScoringCriteria,
  usePortfolioScores, useSavePortfolioScore,
  usePortfolioBenefits, useCreatePortfolioBenefit, useUpdatePortfolioBenefit, useDeletePortfolioBenefit,
  usePortfolioDecisions, useCreatePortfolioDecision, useUpdatePortfolioDecision, useDeletePortfolioDecision
} from "@/hooks/use-portfolio-features";
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
        <div>
          <h1 className="text-3xl font-display font-bold">{portfolio.name}</h1>
          <p className="text-muted-foreground mt-1">{portfolio.description}</p>
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
          <TabsTrigger value="scoring" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm" data-testid="tab-scoring">
            Scoring
          </TabsTrigger>
          <TabsTrigger value="benefits" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm" data-testid="tab-benefits">
            Benefits
          </TabsTrigger>
          <TabsTrigger value="decisions" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm" data-testid="tab-decisions">
            Decisions
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
            <ProjectsTab portfolioId={id} organizationId={currentOrganization?.id || 0} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="scoring">
            <ScoringTab portfolioId={id} organizationId={currentOrganization?.id || 0} />
          </TabsContent>
          <TabsContent value="benefits">
            <BenefitsTab portfolioId={id} />
          </TabsContent>
          <TabsContent value="decisions">
            <DecisionsTab portfolioId={id} />
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

function ProjectsTab({ portfolioId, organizationId }: { portfolioId: number; organizationId: number }) {
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
    return allProjects.filter(p => 
      !portfolioProjectIds.has(p.id) && 
      (p.portfolioId === null || p.portfolioId === undefined)
    );
  }, [allProjects, projects]);

  const filteredAvailableProjects = useMemo(() => {
    if (!searchQuery.trim()) return availableProjects;
    const query = searchQuery.toLowerCase();
    return availableProjects.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.description?.toLowerCase().includes(query)
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
      await Promise.all(
        selectedProjectIds.map(projectId => 
          updateProject.mutateAsync({ id: projectId, portfolioId })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'projects'] });
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
      await updateProject.mutateAsync({ id: projectId, portfolioId: null });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'projects'] });
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
          <CardTitle>Included Projects</CardTitle>
          <CardDescription>All projects within this portfolio</CardDescription>
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
                    <td className="p-3">
                      <Link href={`/projects/${project.id}`}>
                        <div className="hover:text-primary cursor-pointer">
                          <p className="font-medium">{project.name}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>
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
                        <Link href={`/projects/${project.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-project-${project.id}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveProject(project.id)}
                          className="text-muted-foreground hover:text-destructive"
                          data-testid={`button-remove-project-${project.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Projects to Portfolio</DialogTitle>
          <DialogDescription>
            Select projects to add to this portfolio. Only unassigned projects are shown.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
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

          <ScrollArea className="h-[300px] border rounded-md">
            {filteredAvailableProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <FolderOpen className="h-8 w-8 mb-2" />
                <p className="text-sm text-center">
                  {availableProjects.length === 0 
                    ? "No unassigned projects available. All projects are already in portfolios."
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
                    />
                    <div className="flex-1 min-w-0">
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

  // Build heat map data: Status x Health matrix
  const statuses = ["Initiation", "Planning", "Execution", "Monitoring", "Closing"];
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

function ScoringTab({ portfolioId, organizationId }: { portfolioId: number; organizationId: number }) {
  const { toast } = useToast();
  const { data: criteria = [], isLoading: loadingCriteria } = useScoringCriteria(organizationId);
  const { data: scores = [], isLoading: loadingScores } = usePortfolioScores(portfolioId);
  const createCriteria = useCreateScoringCriteria();
  const saveScore = useSavePortfolioScore();
  const deleteCriteria = useDeleteScoringCriteria();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCriteria, setNewCriteria] = useState({ name: '', description: '', category: 'Strategic', weight: '1', maxScore: 10 });
  const [editingScores, setEditingScores] = useState<Record<number, { score: number; justification: string }>>({});

  const getScoreForCriteria = (criteriaId: number) => {
    return scores.find(s => s.criteriaId === criteriaId);
  };

  const calculateTotalScore = () => {
    if (criteria.length === 0) return 0;
    let totalWeightedScore = 0;
    let totalWeight = 0;
    criteria.forEach(c => {
      const score = getScoreForCriteria(c.id);
      if (score) {
        const weight = Number(c.weight) || 1;
        totalWeightedScore += (score.score / (c.maxScore || 10)) * 100 * weight;
        totalWeight += weight;
      }
    });
    return totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
  };

  const handleAddCriteria = async () => {
    try {
      await createCriteria.mutateAsync({
        organizationId,
        data: {
          name: newCriteria.name,
          description: newCriteria.description,
          category: newCriteria.category,
          weight: newCriteria.weight,
          maxScore: newCriteria.maxScore,
        }
      });
      toast({ title: "Scoring criterion added" });
      setIsAddDialogOpen(false);
      setNewCriteria({ name: '', description: '', category: 'Strategic', weight: '1', maxScore: 10 });
    } catch {
      toast({ title: "Error", description: "Failed to add criterion", variant: "destructive" });
    }
  };

  const handleSaveScore = async (criteriaId: number) => {
    const editing = editingScores[criteriaId];
    if (!editing) return;
    try {
      await saveScore.mutateAsync({
        portfolioId,
        criteriaId,
        score: editing.score,
        justification: editing.justification
      });
      toast({ title: "Score saved" });
      setEditingScores(prev => {
        const next = { ...prev };
        delete next[criteriaId];
        return next;
      });
    } catch {
      toast({ title: "Error", description: "Failed to save score", variant: "destructive" });
    }
  };

  const handleDeleteCriteria = async (id: number) => {
    try {
      await deleteCriteria.mutateAsync({ id, organizationId });
      toast({ title: "Criterion deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete criterion", variant: "destructive" });
    }
  };

  if (loadingCriteria || loadingScores) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Portfolio Scoring</h3>
          <p className="text-sm text-muted-foreground">Evaluate this portfolio against defined criteria</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold">{calculateTotalScore()}%</div>
            <div className="text-xs text-muted-foreground">Overall Score</div>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-criteria">
            <Plus className="h-4 w-4 mr-2" />
            Add Criterion
          </Button>
        </div>
      </div>

      {criteria.length === 0 ? (
        <Card className="p-8 text-center">
          <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No scoring criteria defined</p>
          <p className="text-sm text-muted-foreground mt-1">Add criteria to evaluate portfolios</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {criteria.map(c => {
            const existingScore = getScoreForCriteria(c.id);
            const editing = editingScores[c.id];
            const currentScore = editing?.score ?? existingScore?.score ?? 0;
            const currentJustification = editing?.justification ?? existingScore?.justification ?? '';
            const isEditing = c.id in editingScores;

            return (
              <Card key={c.id} data-testid={`criteria-${c.id}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{c.name}</h4>
                        <Badge variant="secondary" className="text-xs">{c.category}</Badge>
                        <Badge variant="outline" className="text-xs">Weight: {c.weight}</Badge>
                      </div>
                      {c.description && <p className="text-sm text-muted-foreground mb-3">{c.description}</p>}
                      
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label className="text-xs">Score (0-{c.maxScore || 10})</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number"
                              min={0}
                              max={c.maxScore || 10}
                              value={currentScore}
                              onChange={(e) => setEditingScores(prev => ({
                                ...prev,
                                [c.id]: { score: parseInt(e.target.value) || 0, justification: currentJustification }
                              }))}
                              className="w-20 h-8"
                              data-testid={`input-score-${c.id}`}
                            />
                            <span className="text-sm text-muted-foreground">/ {c.maxScore || 10}</span>
                            <Progress value={(currentScore / (c.maxScore || 10)) * 100} className="flex-1 h-2" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Justification</Label>
                          <Textarea
                            value={currentJustification}
                            onChange={(e) => setEditingScores(prev => ({
                              ...prev,
                              [c.id]: { score: currentScore, justification: e.target.value }
                            }))}
                            placeholder="Explain the score..."
                            className="mt-1 h-16 text-sm"
                            data-testid={`input-justification-${c.id}`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {isEditing && (
                        <Button size="sm" onClick={() => handleSaveScore(c.id)} disabled={saveScore.isPending} data-testid={`button-save-score-${c.id}`}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteCriteria(c.id)} data-testid={`button-delete-criteria-${c.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Scoring Criterion</DialogTitle>
            <DialogDescription>Define a new criterion for evaluating portfolios</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={newCriteria.name} onChange={(e) => setNewCriteria(p => ({ ...p, name: e.target.value }))} data-testid="input-criteria-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={newCriteria.description} onChange={(e) => setNewCriteria(p => ({ ...p, description: e.target.value }))} data-testid="input-criteria-description" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={newCriteria.category} onValueChange={(v) => setNewCriteria(p => ({ ...p, category: v }))}>
                  <SelectTrigger data-testid="select-criteria-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Risk">Risk</SelectItem>
                    <SelectItem value="Resource">Resource</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Weight</Label>
                <Input type="number" min={1} max={10} value={newCriteria.weight} onChange={(e) => setNewCriteria(p => ({ ...p, weight: e.target.value }))} data-testid="input-criteria-weight" />
              </div>
              <div>
                <Label>Max Score</Label>
                <Input type="number" min={1} max={100} value={newCriteria.maxScore} onChange={(e) => setNewCriteria(p => ({ ...p, maxScore: parseInt(e.target.value) || 10 }))} data-testid="input-criteria-max-score" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCriteria} disabled={!newCriteria.name || createCriteria.isPending} data-testid="button-save-criteria">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BenefitsTab({ portfolioId }: { portfolioId: number }) {
  const { toast } = useToast();
  const { data: benefits = [], isLoading } = usePortfolioBenefits(portfolioId);
  const createBenefit = useCreatePortfolioBenefit();
  const updateBenefit = useUpdatePortfolioBenefit();
  const deleteBenefit = useDeletePortfolioBenefit();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: 'Financial', benefitType: 'Tangible', unit: 'Currency', targetValue: '', actualValue: '', targetDate: '', status: 'Planned' });

  const handleAdd = async () => {
    try {
      await createBenefit.mutateAsync({
        portfolioId,
        data: {
          name: form.name,
          description: form.description,
          category: form.category,
          benefitType: form.benefitType,
          unit: form.unit,
          targetValue: form.targetValue || null,
          actualValue: form.actualValue || null,
          targetDate: form.targetDate || null,
          status: form.status,
        }
      });
      toast({ title: "Benefit added" });
      setIsAddDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to add benefit", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateBenefit.mutateAsync({
        id: editingId,
        portfolioId,
        data: {
          name: form.name,
          description: form.description,
          category: form.category,
          benefitType: form.benefitType,
          unit: form.unit,
          targetValue: form.targetValue || null,
          actualValue: form.actualValue || null,
          targetDate: form.targetDate || null,
          status: form.status,
        }
      });
      toast({ title: "Benefit updated" });
      setEditingId(null);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to update benefit", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBenefit.mutateAsync({ id, portfolioId });
      toast({ title: "Benefit deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete benefit", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', category: 'Financial', benefitType: 'Tangible', unit: 'Currency', targetValue: '', actualValue: '', targetDate: '', status: 'Planned' });
  };

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      description: b.description || '',
      category: b.category || 'Financial',
      benefitType: b.benefitType || 'Tangible',
      unit: b.unit || 'Currency',
      targetValue: b.targetValue || '',
      actualValue: b.actualValue || '',
      targetDate: b.targetDate || '',
      status: b.status || 'Planned',
    });
  };

  const getRealizationPercentage = (b: any) => {
    if (!b.targetValue || Number(b.targetValue) === 0) return 0;
    return Math.min(100, Math.round((Number(b.actualValue || 0) / Number(b.targetValue)) * 100));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Fully Realized': return 'bg-green-500';
      case 'Partially Realized': return 'bg-yellow-500';
      case 'In Progress': return 'bg-blue-500';
      case 'Not Achieved': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Benefits Tracking</h3>
          <p className="text-sm text-muted-foreground">Track expected and realized benefits</p>
        </div>
        <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} data-testid="button-add-benefit">
          <Plus className="h-4 w-4 mr-2" />
          Add Benefit
        </Button>
      </div>

      {benefits.length === 0 ? (
        <Card className="p-8 text-center">
          <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No benefits defined</p>
          <p className="text-sm text-muted-foreground mt-1">Add benefits to track portfolio value</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {benefits.map(b => (
            <Card key={b.id} data-testid={`benefit-${b.id}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{b.name}</h4>
                      <Badge variant="secondary" className="text-xs">{b.category}</Badge>
                      <Badge variant="outline" className="text-xs">{b.benefitType}</Badge>
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(b.status || 'Planned')}`} />
                      <span className="text-xs text-muted-foreground">{b.status}</span>
                    </div>
                    {b.description && <p className="text-sm text-muted-foreground mb-3">{b.description}</p>}
                    
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <Label className="text-xs">Target</Label>
                        <div className="text-sm font-medium">{b.unit === 'Currency' ? '$' : ''}{Number(b.targetValue || 0).toLocaleString()}{b.unit === 'Percentage' ? '%' : ''}</div>
                      </div>
                      <div>
                        <Label className="text-xs">Actual</Label>
                        <div className="text-sm font-medium">{b.unit === 'Currency' ? '$' : ''}{Number(b.actualValue || 0).toLocaleString()}{b.unit === 'Percentage' ? '%' : ''}</div>
                      </div>
                      <div>
                        <Label className="text-xs">Target Date</Label>
                        <div className="text-sm">{b.targetDate ? format(new Date(b.targetDate), 'MMM d, yyyy') : 'Not set'}</div>
                      </div>
                      <div>
                        <Label className="text-xs">Realization</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={getRealizationPercentage(b)} className="h-2 flex-1" />
                          <span className="text-sm font-medium">{getRealizationPercentage(b)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-benefit-menu-${b.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => startEdit(b)} data-testid={`button-edit-benefit-${b.id}`}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(b.id)} className="text-destructive" data-testid={`button-delete-benefit-${b.id}`}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isAddDialogOpen || editingId !== null} onOpenChange={(open) => { if (!open) { setIsAddDialogOpen(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Benefit' : 'Add Benefit'}</DialogTitle>
            <DialogDescription>Define a benefit to track for this portfolio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} data-testid="input-benefit-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-benefit-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger data-testid="select-benefit-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Operational">Operational</SelectItem>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.benefitType} onValueChange={(v) => setForm(p => ({ ...p, benefitType: v }))}>
                  <SelectTrigger data-testid="select-benefit-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tangible">Tangible</SelectItem>
                    <SelectItem value="Intangible">Intangible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger data-testid="select-benefit-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Currency">Currency ($)</SelectItem>
                    <SelectItem value="Percentage">Percentage (%)</SelectItem>
                    <SelectItem value="Number">Number</SelectItem>
                    <SelectItem value="Hours">Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Value</Label>
                <Input type="number" value={form.targetValue} onChange={(e) => setForm(p => ({ ...p, targetValue: e.target.value }))} data-testid="input-benefit-target" />
              </div>
              <div>
                <Label>Actual Value</Label>
                <Input type="number" value={form.actualValue} onChange={(e) => setForm(p => ({ ...p, actualValue: e.target.value }))} data-testid="input-benefit-actual" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Date</Label>
                <Input type="date" value={form.targetDate} onChange={(e) => setForm(p => ({ ...p, targetDate: e.target.value }))} data-testid="input-benefit-target-date" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger data-testid="select-benefit-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Partially Realized">Partially Realized</SelectItem>
                    <SelectItem value="Fully Realized">Fully Realized</SelectItem>
                    <SelectItem value="Not Achieved">Not Achieved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={editingId ? handleUpdate : handleAdd} disabled={!form.name} data-testid="button-save-benefit">
              {editingId ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DecisionsTab({ portfolioId }: { portfolioId: number }) {
  const { toast } = useToast();
  const { data: decisions = [], isLoading } = usePortfolioDecisions(portfolioId);
  const createDecision = useCreatePortfolioDecision();
  const updateDecision = useUpdatePortfolioDecision();
  const deleteDecision = useDeletePortfolioDecision();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', description: '', decisionType: 'Strategic', status: 'Pending', rationale: '', impact: '', priority: 'Medium', decisionDate: '' });

  const handleAdd = async () => {
    try {
      await createDecision.mutateAsync({
        portfolioId,
        data: {
          title: form.title,
          description: form.description,
          decisionType: form.decisionType,
          status: form.status,
          rationale: form.rationale,
          impact: form.impact,
          priority: form.priority,
          decisionDate: form.decisionDate || null,
        }
      });
      toast({ title: "Decision logged" });
      setIsAddDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to log decision", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateDecision.mutateAsync({
        id: editingId,
        portfolioId,
        data: {
          title: form.title,
          description: form.description,
          decisionType: form.decisionType,
          status: form.status,
          rationale: form.rationale,
          impact: form.impact,
          priority: form.priority,
          decisionDate: form.decisionDate || null,
        }
      });
      toast({ title: "Decision updated" });
      setEditingId(null);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to update decision", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDecision.mutateAsync({ id, portfolioId });
      toast({ title: "Decision deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete decision", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', decisionType: 'Strategic', status: 'Pending', rationale: '', impact: '', priority: 'Medium', decisionDate: '' });
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setForm({
      title: d.title,
      description: d.description || '',
      decisionType: d.decisionType || 'Strategic',
      status: d.status || 'Pending',
      rationale: d.rationale || '',
      impact: d.impact || '',
      priority: d.priority || 'Medium',
      decisionDate: d.decisionDate || '',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-500';
      case 'Implemented': return 'bg-blue-500';
      case 'Rejected': return 'bg-red-500';
      case 'Deferred': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'destructive';
      case 'High': return 'default';
      case 'Medium': return 'secondary';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Decision Log</h3>
          <p className="text-sm text-muted-foreground">Track key portfolio decisions and their outcomes</p>
        </div>
        <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} data-testid="button-add-decision">
          <Plus className="h-4 w-4 mr-2" />
          Log Decision
        </Button>
      </div>

      {decisions.length === 0 ? (
        <Card className="p-8 text-center">
          <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No decisions logged</p>
          <p className="text-sm text-muted-foreground mt-1">Log important portfolio decisions</p>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Decision</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {decisions.map(d => (
              <TableRow key={d.id} data-testid={`decision-${d.id}`}>
                <TableCell>
                  <div>
                    <div className="font-medium">{d.title}</div>
                    {d.description && <div className="text-sm text-muted-foreground line-clamp-1">{d.description}</div>}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{d.decisionType}</Badge></TableCell>
                <TableCell><Badge variant={getPriorityColor(d.priority || 'Medium') as any}>{d.priority}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${getStatusColor(d.status || 'Pending')}`} />
                    <span className="text-sm">{d.status}</span>
                  </div>
                </TableCell>
                <TableCell>{d.decisionDate ? format(new Date(d.decisionDate), 'MMM d, yyyy') : '-'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-decision-menu-${d.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => startEdit(d)} data-testid={`button-edit-decision-${d.id}`}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(d.id)} className="text-destructive" data-testid={`button-delete-decision-${d.id}`}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isAddDialogOpen || editingId !== null} onOpenChange={(open) => { if (!open) { setIsAddDialogOpen(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Decision' : 'Log Decision'}</DialogTitle>
            <DialogDescription>Record an important portfolio decision</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} data-testid="input-decision-title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-decision-description" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.decisionType} onValueChange={(v) => setForm(p => ({ ...p, decisionType: v }))}>
                  <SelectTrigger data-testid="select-decision-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Resource">Resource</SelectItem>
                    <SelectItem value="Risk">Risk</SelectItem>
                    <SelectItem value="Scope">Scope</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger data-testid="select-decision-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger data-testid="select-decision-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Deferred">Deferred</SelectItem>
                    <SelectItem value="Implemented">Implemented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Decision Date</Label>
              <Input type="date" value={form.decisionDate} onChange={(e) => setForm(p => ({ ...p, decisionDate: e.target.value }))} data-testid="input-decision-date" />
            </div>
            <div>
              <Label>Rationale</Label>
              <Textarea value={form.rationale} onChange={(e) => setForm(p => ({ ...p, rationale: e.target.value }))} placeholder="Why was this decision made?" data-testid="input-decision-rationale" />
            </div>
            <div>
              <Label>Expected Impact</Label>
              <Textarea value={form.impact} onChange={(e) => setForm(p => ({ ...p, impact: e.target.value }))} placeholder="What is the expected impact?" data-testid="input-decision-impact" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={editingId ? handleUpdate : handleAdd} disabled={!form.title} data-testid="button-save-decision">
              {editingId ? 'Update' : 'Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
