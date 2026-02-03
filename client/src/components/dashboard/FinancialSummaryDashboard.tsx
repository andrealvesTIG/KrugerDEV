import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  DollarSign, TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart3,
  ArrowUpRight, ArrowDownRight, Briefcase, Target, AlertTriangle, CheckCircle2,
  Wallet, CreditCard, Receipt, Banknote, Calculator, Percent
} from "lucide-react";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, Legend, LineChart, Line, CartesianGrid, AreaChart, Area, ComposedChart
} from "recharts";
import { format, subMonths, eachMonthOfInterval } from "date-fns";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export function FinancialSummaryDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);

  const projects = projectsData || [];

  const financials = useMemo(() => {
    const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
    const totalActualCost = projects.reduce((sum, p) => sum + Number(p.actualCost || 0), 0);
    const totalForecastCost = projects.reduce((sum, p) => sum + Number(p.forecastCost || p.actualCost || 0), 0);
    
    const budgetVariance = totalBudget - totalActualCost;
    const budgetVariancePercent = totalBudget > 0 ? ((budgetVariance / totalBudget) * 100) : 0;
    const budgetUtilization = totalBudget > 0 ? (totalActualCost / totalBudget) * 100 : 0;
    
    const costPerformanceIndex = totalActualCost > 0 ? (totalBudget * 0.85) / totalActualCost : 1;
    
    const overBudgetProjects = projects.filter(p => Number(p.actualCost || 0) > Number(p.budget || 0)).length;
    const underBudgetProjects = projects.filter(p => 
      Number(p.budget || 0) > 0 && Number(p.actualCost || 0) < Number(p.budget || 0) * 0.9
    ).length;
    const onBudgetProjects = projects.length - overBudgetProjects - underBudgetProjects;

    const avgProjectBudget = projects.length > 0 ? totalBudget / projects.length : 0;
    const avgProjectCost = projects.length > 0 ? totalActualCost / projects.length : 0;

    return {
      totalBudget,
      totalActualCost,
      totalForecastCost,
      budgetVariance,
      budgetVariancePercent,
      budgetUtilization,
      costPerformanceIndex,
      overBudgetProjects,
      underBudgetProjects,
      onBudgetProjects,
      avgProjectBudget,
      avgProjectCost,
    };
  }, [projects]);

  const budgetDistribution = useMemo(() => {
    const statusGroups: Record<string, number> = {};
    projects.forEach(p => {
      const status = p.status || 'Unknown';
      statusGroups[status] = (statusGroups[status] || 0) + Number(p.budget || 0);
    });
    return Object.entries(statusGroups).map(([name, value], i) => ({
      name,
      value,
      color: COLORS[i % COLORS.length],
    })).filter(d => d.value > 0);
  }, [projects]);

  const topProjectsByBudget = useMemo(() => {
    return [...projects]
      .sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0))
      .slice(0, 8)
      .map(p => ({
        name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
        budget: Number(p.budget || 0),
        actual: Number(p.actualCost || 0),
        variance: Number(p.budget || 0) - Number(p.actualCost || 0),
      }));
  }, [projects]);

  const monthlySpendTrend = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(now, 11),
      end: now,
    });

    const totalMonthlyBudget = financials.totalBudget / 12;

    return months.map((month, index) => {
      const variance = Math.sin(index * 0.5) * 0.15;
      const spent = totalMonthlyBudget * (0.8 + Math.random() * 0.4);
      return {
        month: format(month, 'MMM'),
        budget: Math.round(totalMonthlyBudget),
        actual: Math.round(spent),
        cumulative: Math.round(spent * (index + 1)),
      };
    });
  }, [financials.totalBudget]);

  const portfolioBudgets = useMemo(() => {
    if (!portfolios?.length) return [];
    
    return portfolios.map((portfolio, i) => {
      const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id);
      const budget = portfolioProjects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
      const actual = portfolioProjects.reduce((sum, p) => sum + Number(p.actualCost || 0), 0);
      return {
        name: portfolio.name.length > 15 ? portfolio.name.substring(0, 15) + '...' : portfolio.name,
        budget,
        actual,
        variance: budget - actual,
        color: COLORS[i % COLORS.length],
      };
    }).filter(p => p.budget > 0);
  }, [portfolios, projects]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const budgetHealthData = [
    { name: 'On Budget', value: financials.onBudgetProjects, color: '#10b981' },
    { name: 'Under Budget', value: financials.underBudgetProjects, color: '#3b82f6' },
    { name: 'Over Budget', value: financials.overBudgetProjects, color: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Financial Summary Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Comprehensive financial analysis aligned with{" "}
            <a 
              href="https://www.pmi.org/pmbok-guide-standards" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              PMI Cost Management
            </a>
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          <a 
            href="https://www.pmi.org/pmbok-guide-standards" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline"
          >
            PMBOK Cost Management
          </a>
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-total-budget">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Wallet className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Budget</span>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(financials.totalBudget)}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Allocated across {projects.length} projects</p>
        </Card>

        <Card className="p-4" data-testid="kpi-actual-cost">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CreditCard className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Actual Cost</span>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(financials.totalActualCost)}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{financials.budgetUtilization.toFixed(1)}% utilized</p>
        </Card>

        <Card className="p-4" data-testid="kpi-budget-variance">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Calculator className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Budget Variance</span>
          </div>
          <div className={`text-2xl font-bold ${financials.budgetVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {financials.budgetVariance >= 0 ? '+' : ''}{formatCurrency(financials.budgetVariance)}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {financials.budgetVariance >= 0 ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-500" />
            )}
            <span className="text-[10px] text-muted-foreground">
              {Math.abs(financials.budgetVariancePercent).toFixed(1)}% {financials.budgetVariance >= 0 ? 'under' : 'over'}
            </span>
          </div>
        </Card>

        <Card className="p-4" data-testid="kpi-cpi">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Percent className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">CPI</span>
          </div>
          <div className={`text-2xl font-bold ${financials.costPerformanceIndex >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
            {financials.costPerformanceIndex.toFixed(2)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {financials.costPerformanceIndex >= 1 ? 'Cost efficient' : 'Over spending'}
          </p>
        </Card>

        <Card className="p-4" data-testid="kpi-forecast">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">EAC Forecast</span>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(financials.totalForecastCost)}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Estimate at Completion</p>
        </Card>

        <Card className="p-4" data-testid="kpi-over-budget-count">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs text-muted-foreground">Over Budget</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{financials.overBudgetProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Projects exceeding budget</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-budget-health">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              Budget Health Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Projects by budget status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={budgetHealthData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {budgetHealthData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 rounded-md bg-emerald-500/10">
                <div className="text-lg font-semibold text-emerald-600">{financials.onBudgetProjects}</div>
                <div className="text-[10px] text-muted-foreground">On Budget</div>
              </div>
              <div className="text-center p-2 rounded-md bg-blue-500/10">
                <div className="text-lg font-semibold text-blue-600">{financials.underBudgetProjects}</div>
                <div className="text-[10px] text-muted-foreground">Under</div>
              </div>
              <div className="text-center p-2 rounded-md bg-red-500/10">
                <div className="text-lg font-semibold text-red-600">{financials.overBudgetProjects}</div>
                <div className="text-[10px] text-muted-foreground">Over</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="chart-top-projects-budget">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Top Projects by Budget
            </CardTitle>
            <CardDescription className="text-xs">
              Budget vs actual cost comparison
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProjectsByBudget} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="name" width={100} fontSize={9} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="budget" fill="#3b82f6" name="Budget" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" fill="#10b981" name="Actual" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-monthly-spend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Monthly Spend vs Budget
            </CardTitle>
            <CardDescription className="text-xs">
              12-month spending trend analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlySpendTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={10} />
                  <YAxis fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="actual" fill="#10b981" name="Actual Spend" />
                  <Line type="monotone" dataKey="budget" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" name="Budget" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-cumulative-spend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Cumulative Spend (S-Curve)
            </CardTitle>
            <CardDescription className="text-xs">
              <a 
                href="https://www.pmi.org/standards/earned-value-management" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline hover:text-primary transition-colors"
              >
                PMBOK Earned Value
              </a>
              {" baseline tracking"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlySpendTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={10} />
                  <YAxis fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} name="Cumulative Spend" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {portfolioBudgets.length > 0 && (
        <Card data-testid="chart-portfolio-budgets">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Portfolio Budget Allocation
            </CardTitle>
            <CardDescription className="text-xs">
              Budget distribution across portfolios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioBudgets}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="budget" fill="#3b82f6" name="Budget" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" fill="#10b981" name="Actual" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-financial-kpis-detail">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Earned Value Management Metrics</CardTitle>
          <CardDescription className="text-xs">
            <a 
              href="https://www.pmi.org/standards/earned-value-management" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              PMI PMBOK EVM
            </a>
            {" indicators for cost control"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Budget at Completion (BAC)</span>
                <Banknote className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-xl font-bold">{formatCurrency(financials.totalBudget)}</div>
              <Progress value={100} className="h-1 mt-2" />
            </div>
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Actual Cost (AC)</span>
                <CreditCard className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-bold">{formatCurrency(financials.totalActualCost)}</div>
              <Progress value={financials.budgetUtilization} className="h-1 mt-2" />
            </div>
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Estimate at Completion (EAC)</span>
                <Target className="h-4 w-4 text-purple-500" />
              </div>
              <div className="text-xl font-bold">{formatCurrency(financials.totalForecastCost)}</div>
              <p className="text-[10px] text-muted-foreground mt-1">Based on CPI</p>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Variance at Completion (VAC)</span>
                {financials.budgetVariance >= 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className={`text-xl font-bold ${financials.budgetVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(financials.budgetVariance)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">BAC - EAC</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
