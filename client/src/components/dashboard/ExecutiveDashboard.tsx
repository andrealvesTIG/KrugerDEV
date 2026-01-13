import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { KpiCard } from "./KpiCard";
import { DashboardChartCard } from "./DashboardChartCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Briefcase, AlertTriangle, TrendingUp, CheckCircle2, FileInput, Clock, Upload, PenTool, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import type { ProjectIntake } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
};

export function ExecutiveDashboard() {
  const { currentOrganization } = useOrganization();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  
  const generateProjectMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest('POST', '/api/ai/generate-project', {
        prompt,
        organizationId: currentOrganization?.id,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Project Created",
        description: `Created "${data.project.name}" with ${data.summary.tasksCreated} tasks, ${data.summary.issuesCreated} issues, and ${data.summary.risksCreated} risks.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setAiDialogOpen(false);
      setAiPrompt("");
      setLocation(`/projects/${data.project.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate project with AI",
        variant: "destructive",
      });
    },
  });
  
  const projects = (projectsData ?? []).filter(p => {
    if (sourceFilter === "all") return true;
    if (sourceFilter === "manual") return p.source === "manual" || !p.source;
    if (sourceFilter === "imported") return p.source === "imported";
    return true;
  });

  const { data: intakes, isLoading: intakesLoading } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch intakes');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  if (projectsLoading || portfoliosLoading || intakesLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatBudget = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const totalProjects = projects?.length || 0;
  const totalPortfolios = portfolios?.length || 0;
  const criticalProjects = projects?.filter(p => p.health === "Red").length || 0;
  const completedProjects = projects?.filter(p => p.status === "Closing").length || 0;
  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget || 0), 0) || 0;
  
  const totalIntakes = intakes?.length || 0;
  const intakesInReview = intakes?.filter(i => i.status === "draft" || i.status === "in_progress").length || 0;
  const approvedIntakes = intakes?.filter(i => i.status === "approved").length || 0;
  const rejectedIntakes = intakes?.filter(i => i.status === "rejected").length || 0;

  const healthData = [
    { name: "Healthy", value: projects?.filter(p => p.health === "Green").length || 0, color: COLORS.Green },
    { name: "At Risk", value: projects?.filter(p => p.health === "Yellow").length || 0, color: COLORS.Yellow },
    { name: "Critical", value: projects?.filter(p => p.health === "Red").length || 0, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const statusData = projects?.reduce((acc, curr) => {
    const status = curr.status;
    const existing = acc.find(i => i.name === status);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ name: status, count: 1 });
    }
    return acc;
  }, [] as { name: string, count: number }[]) || [];

  const intakeStatusData = [
    { name: "Draft", value: intakes?.filter(i => i.status === "draft").length || 0, color: COLORS.Yellow },
    { name: "In Review", value: intakes?.filter(i => i.status === "in_progress").length || 0, color: COLORS.Blue },
    { name: "Approved", value: approvedIntakes, color: COLORS.Green },
    { name: "Rejected", value: rejectedIntakes, color: COLORS.Red },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 justify-end">
        <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-ai-generate-project" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI Create Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Create Project with AI
              </DialogTitle>
              <DialogDescription>
                Describe your project and AI will generate a complete project plan with tasks, issues, and risks.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ai-prompt">Project Description</Label>
                <Textarea
                  id="ai-prompt"
                  data-testid="textarea-ai-prompt"
                  placeholder="E.g., Build a mobile app for tracking fitness goals with user authentication, workout logging, and progress charts. The project should take about 3 months."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="min-h-[150px]"
                />
              </div>
              {generateProjectMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating project plan...
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAiDialogOpen(false)}
                disabled={generateProjectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid="button-generate-project"
                onClick={() => generateProjectMutation.mutate(aiPrompt)}
                disabled={!aiPrompt.trim() || generateProjectMutation.isPending}
              >
                {generateProjectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Project
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="w-full sm:w-[180px]">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger data-testid="select-dashboard-source-filter">
              <SelectValue placeholder="Filter by Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="manual">
                <span className="flex items-center gap-2">
                  <PenTool className="h-3 w-3" />
                  Created in App
                </span>
              </SelectItem>
              <SelectItem value="imported">
                <span className="flex items-center gap-2">
                  <Upload className="h-3 w-3" />
                  Imported
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Projects"
          value={totalProjects}
          subtitle={`Across ${totalPortfolios} portfolios`}
          icon={Briefcase}
          iconColor="text-primary"
          borderColor="border-l-primary"
          href="/projects"
          testId="link-total-projects"
        />
        <KpiCard
          title="Critical Projects"
          value={criticalProjects}
          subtitle="Require immediate attention"
          icon={AlertTriangle}
          iconColor="text-rose-500"
          borderColor="border-l-rose-500"
          href="/projects?health=Red"
          delay={0.2}
          testId="link-critical-projects"
        />
        <KpiCard
          title="Completed"
          value={completedProjects}
          subtitle="Successfully closed"
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          borderColor="border-l-emerald-500"
          href="/projects?status=Closing"
          delay={0.3}
          testId="link-completed-projects"
        />
        <KpiCard
          title="Active Budget"
          value={formatBudget(totalBudget)}
          subtitle="Total budget allocation"
          icon={TrendingUp}
          iconColor="text-blue-500"
          borderColor="border-l-blue-500"
          href="/projects"
          delay={0.4}
          testId="link-active-budget"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Intake Requests"
          value={totalIntakes}
          subtitle="Total submissions"
          icon={FileInput}
          iconColor="text-purple-500"
          borderColor="border-l-purple-500"
          href="/intakes"
          delay={0.45}
          testId="link-total-intakes"
        />
        <KpiCard
          title="In Review"
          value={intakesInReview}
          subtitle="Awaiting decision"
          icon={Clock}
          iconColor="text-amber-500"
          borderColor="border-l-amber-500"
          href="/intakes"
          delay={0.5}
          testId="link-intakes-in-review"
        />
        <KpiCard
          title="Approved"
          value={approvedIntakes}
          subtitle="Converted to projects"
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          borderColor="border-l-emerald-500"
          href="/intakes"
          delay={0.55}
          testId="link-approved-intakes"
        />
        <KpiCard
          title="Rejected"
          value={rejectedIntakes}
          subtitle="Did not proceed"
          icon={AlertTriangle}
          iconColor="text-rose-500"
          borderColor="border-l-rose-500"
          href="/intakes"
          delay={0.6}
          testId="link-rejected-intakes"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardChartCard
          title="Project Health Distribution"
          description="Current health status across all active projects"
          href="/projects"
          testId="link-health-chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={healthData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {healthData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Projects by Status"
          description="Distribution of projects across lifecycle stages"
          href="/projects"
          delay={0.6}
          testId="link-status-chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        {intakeStatusData.length > 0 && (
          <DashboardChartCard
            title="Intake Pipeline"
            description="Status of intake requests in the approval workflow"
            href="/intakes"
            delay={0.7}
            testId="link-intake-pipeline-chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={intakeStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {intakeStatusData.map((entry, index) => (
                    <Cell key={`intake-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </DashboardChartCard>
        )}
      </div>
    </div>
  );
}
