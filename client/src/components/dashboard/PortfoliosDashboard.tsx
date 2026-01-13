import { usePortfolios } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { KpiCard } from "./KpiCard";
import { DashboardChartCard } from "./DashboardChartCard";
import { Loader2, FolderKanban, Target, TrendingUp, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Indigo: "#6366f1",
  Pink: "#ec4899",
  Teal: "#14b8a6",
};

const PORTFOLIO_COLORS = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Pink, COLORS.Indigo, COLORS.Green];

export function PortfoliosDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const { data: projects, isLoading: projectsLoading } = useProjects(currentOrganization?.id);

  if (portfoliosLoading || projectsLoading) {
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

  const totalPortfolios = portfolios?.length || 0;
  const activeProjects = projects?.filter(p => p.status !== "Closing")?.length || 0;
  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget || 0), 0) || 0;
  const avgCompletionRate = projects?.length 
    ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
    : 0;

  const portfolioProjectCounts = portfolios?.map((portfolio, index) => ({
    name: portfolio.name.length > 15 ? portfolio.name.substring(0, 15) + "..." : portfolio.name,
    fullName: portfolio.name,
    projects: projects?.filter(p => p.portfolioId === portfolio.id).length || 0,
    color: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length],
  })) || [];

  const portfolioBudgets = portfolios?.map((portfolio, index) => ({
    name: portfolio.name.length > 15 ? portfolio.name.substring(0, 15) + "..." : portfolio.name,
    fullName: portfolio.name,
    budget: projects?.filter(p => p.portfolioId === portfolio.id).reduce((sum, p) => sum + Number(p.budget || 0), 0) || 0,
    color: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length],
  })) || [];

  const portfolioHealthData = portfolios?.map((portfolio, index) => {
    const portfolioProjects = projects?.filter(p => p.portfolioId === portfolio.id) || [];
    const greenCount = portfolioProjects.filter(p => p.health === "Green").length;
    const totalCount = portfolioProjects.length;
    const healthPercentage = totalCount > 0 ? Math.round((greenCount / totalCount) * 100) : 0;
    return {
      name: portfolio.name.length > 12 ? portfolio.name.substring(0, 12) + "..." : portfolio.name,
      fullName: portfolio.name,
      health: healthPercentage,
      color: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length],
    };
  }) || [];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Portfolios"
          value={totalPortfolios}
          subtitle="Active portfolio groups"
          icon={FolderKanban}
          iconColor="text-purple-500"
          borderColor="border-l-purple-500"
          href="/portfolios"
          testId="link-total-portfolios"
        />
        <KpiCard
          title="Active Projects"
          value={activeProjects}
          subtitle="Across all portfolios"
          icon={Target}
          iconColor="text-blue-500"
          borderColor="border-l-blue-500"
          href="/projects"
          delay={0.2}
          testId="link-portfolio-active-projects"
        />
        <KpiCard
          title="Avg. Completion"
          value={`${avgCompletionRate}%`}
          subtitle="Portfolio-wide progress"
          icon={TrendingUp}
          iconColor="text-emerald-500"
          borderColor="border-l-emerald-500"
          delay={0.3}
          testId="text-avg-completion"
        />
        <KpiCard
          title="Total Investment"
          value={formatBudget(totalBudget)}
          subtitle="Combined portfolio budget"
          icon={DollarSign}
          iconColor="text-amber-500"
          borderColor="border-l-amber-500"
          delay={0.4}
          testId="text-total-investment"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardChartCard
          title="Projects by Portfolio"
          description="Distribution of projects across portfolios"
          href="/portfolios"
          testId="chart-projects-by-portfolio"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={portfolioProjectCounts} layout="vertical">
              <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={100} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number, name: string, props: any) => [value, props.payload.fullName]}
              />
              <Bar dataKey="projects" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Budget Allocation"
          description="Budget distribution across portfolios"
          testId="chart-budget-allocation"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={portfolioBudgets.filter(p => p.budget > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="budget"
                nameKey="name"
              >
                {portfolioBudgets.filter(p => p.budget > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => formatBudget(value)}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Portfolio Health Scores"
          description="Percentage of healthy projects per portfolio"
          testId="chart-portfolio-health"
          className="md:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={portfolioHealthData}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number, name: string, props: any) => [`${value}%`, props.payload.fullName]}
              />
              <Bar dataKey="health" radius={[4, 4, 0, 0]}>
                {portfolioHealthData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.health >= 70 ? COLORS.Green : entry.health >= 40 ? COLORS.Yellow : COLORS.Red} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>
      </div>
    </div>
  );
}
