import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Loader2, Briefcase, AlertTriangle, TrendingUp, CheckCircle2, FileInput, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import type { ProjectIntake } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
};

export default function Dashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projects, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
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

  // Calculate Metrics
  const totalProjects = projects?.length || 0;
  const totalPortfolios = portfolios?.length || 0;
  const criticalProjects = projects?.filter(p => p.health === "Red").length || 0;
  const completedProjects = projects?.filter(p => p.status === "Closing").length || 0;
  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget || 0), 0) || 0;
  
  // Intake Metrics
  const totalIntakes = intakes?.length || 0;
  const intakesInReview = intakes?.filter(i => i.status === "draft" || i.status === "in_progress").length || 0;
  const approvedIntakes = intakes?.filter(i => i.status === "approved").length || 0;
  const rejectedIntakes = intakes?.filter(i => i.status === "rejected").length || 0;
  
  // Format budget for display
  const formatBudget = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toLocaleString()}`;
  };

  // Prepare Chart Data
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

  // Intake Pipeline Data
  const intakeStatusData = [
    { name: "Draft", value: intakes?.filter(i => i.status === "draft").length || 0, color: COLORS.Yellow },
    { name: "In Review", value: intakes?.filter(i => i.status === "in_progress").length || 0, color: COLORS.Blue },
    { name: "Approved", value: approvedIntakes, color: COLORS.Green },
    { name: "Rejected", value: rejectedIntakes, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Executive Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Overview of your project portfolio performance and health.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
          <Link href="/projects" data-testid="link-total-projects">
            <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
                <Briefcase className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{totalProjects}</div>
                <p className="text-xs text-muted-foreground">Across {totalPortfolios} portfolios</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.2 }}>
          <Link href="/projects?health=Red" data-testid="link-critical-projects">
            <Card className="border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Critical Projects</CardTitle>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{criticalProjects}</div>
                <p className="text-xs text-muted-foreground">Require immediate attention</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.3 }}>
          <Link href="/projects?status=Closing" data-testid="link-completed-projects">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{completedProjects}</div>
                <p className="text-xs text-muted-foreground">Successfully closed</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.4 }}>
          <Link href="/projects" data-testid="link-active-budget">
            <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Budget</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground" data-testid="text-total-budget">{formatBudget(totalBudget)}</div>
                <p className="text-xs text-muted-foreground">Total budget allocation</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </div>

      {/* Intake Pipeline KPIs */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div {...fadeIn} transition={{ delay: 0.45 }}>
          <Link href="/intakes" data-testid="link-total-intakes">
            <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Intake Requests</CardTitle>
                <FileInput className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{totalIntakes}</div>
                <p className="text-xs text-muted-foreground">Total submissions</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.5 }}>
          <Link href="/intakes" data-testid="link-intakes-in-review">
            <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">In Review</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{intakesInReview}</div>
                <p className="text-xs text-muted-foreground">Awaiting decision</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.55 }}>
          <Link href="/intakes" data-testid="link-approved-intakes">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{approvedIntakes}</div>
                <p className="text-xs text-muted-foreground">Converted to projects</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.6 }}>
          <Link href="/intakes" data-testid="link-rejected-intakes">
            <Card className="border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{rejectedIntakes}</div>
                <p className="text-xs text-muted-foreground">Did not proceed</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <motion.div {...fadeIn} transition={{ delay: 0.5 }}>
          <Link href="/projects" data-testid="link-health-chart">
            <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle>Project Health Distribution</CardTitle>
                <CardDescription>Current health status across all active projects</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
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
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div {...fadeIn} transition={{ delay: 0.6 }}>
          <Link href="/projects" data-testid="link-status-chart">
            <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle>Projects by Status</CardTitle>
                <CardDescription>Distribution of projects across lifecycle stages</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
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
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {intakeStatusData.length > 0 && (
          <motion.div {...fadeIn} transition={{ delay: 0.7 }}>
            <Link href="/intakes" data-testid="link-intake-pipeline-chart">
              <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle>Intake Pipeline</CardTitle>
                  <CardDescription>Status of intake requests in the approval workflow</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
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
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
