import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, Clock, TrendingUp, AlertTriangle, CheckCircle2, 
  BarChart3, Target, Activity, Flag, Milestone
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { format, parseISO, differenceInDays, addMonths, startOfMonth, eachMonthOfInterval, isWithinInterval } from "date-fns";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function PortfolioTimelineDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);

  const projects = projectsData || [];

  const timelineMetrics = useMemo(() => {
    const now = new Date();
    const projectsWithDates = projects.filter(p => p.startDate && p.endDate);
    
    const onSchedule = projectsWithDates.filter(p => {
      const endDate = new Date(p.endDate!);
      return endDate >= now;
    }).length;

    const overdue = projectsWithDates.filter(p => {
      const endDate = new Date(p.endDate!);
      return endDate < now && p.status !== 'Closed';
    }).length;

    const completedOnTime = projectsWithDates.filter(p => {
      if (p.status !== 'Closed' || !p.actualEndDate) return false;
      return new Date(p.actualEndDate) <= new Date(p.endDate!);
    }).length;

    const avgDuration = projectsWithDates.length > 0
      ? Math.round(projectsWithDates.reduce((sum, p) => {
          const start = new Date(p.startDate!);
          const end = new Date(p.endDate!);
          return sum + differenceInDays(end, start);
        }, 0) / projectsWithDates.length)
      : 0;

    const upcomingMilestones = projects.filter(p => {
      if (!p.endDate) return false;
      const endDate = new Date(p.endDate);
      const thirtyDaysFromNow = addMonths(now, 1);
      return endDate >= now && endDate <= thirtyDaysFromNow;
    }).length;

    return {
      total: projectsWithDates.length,
      onSchedule,
      overdue,
      completedOnTime,
      avgDuration,
      upcomingMilestones,
      scheduleCompliance: projectsWithDates.length > 0 
        ? Math.round((onSchedule / projectsWithDates.length) * 100) 
        : 0,
    };
  }, [projects]);

  const monthlyProjectLoad = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: addMonths(now, -6),
      end: addMonths(now, 6),
    });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = addMonths(monthStart, 1);

      const activeInMonth = projects.filter(p => {
        if (!p.startDate || !p.endDate) return false;
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        return start <= monthEnd && end >= monthStart;
      }).length;

      const startingInMonth = projects.filter(p => {
        if (!p.startDate) return false;
        const start = new Date(p.startDate);
        return isWithinInterval(start, { start: monthStart, end: monthEnd });
      }).length;

      const endingInMonth = projects.filter(p => {
        if (!p.endDate) return false;
        const end = new Date(p.endDate);
        return isWithinInterval(end, { start: monthStart, end: monthEnd });
      }).length;

      return {
        month: format(month, 'MMM yyyy'),
        shortMonth: format(month, 'MMM'),
        active: activeInMonth,
        starting: startingInMonth,
        ending: endingInMonth,
        isPast: month < now,
      };
    });
  }, [projects]);

  const projectTimelineData = useMemo(() => {
    return projects
      .filter(p => p.startDate && p.endDate)
      .map(p => {
        const start = new Date(p.startDate!);
        const end = new Date(p.endDate!);
        const duration = differenceInDays(end, start);
        const now = new Date();
        const elapsed = Math.max(0, differenceInDays(now, start));
        const progress = duration > 0 ? Math.min(100, Math.round((elapsed / duration) * 100)) : 0;

        return {
          name: p.name.length > 25 ? p.name.substring(0, 25) + '...' : p.name,
          fullName: p.name,
          start: format(start, 'MMM dd'),
          end: format(end, 'MMM dd'),
          duration,
          progress: p.completionPercentage || 0,
          timeProgress: progress,
          health: p.health,
          status: p.status,
          isOverdue: end < now && p.status !== 'Closed',
        };
      })
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 12);
  }, [projects]);

  const portfolioTimelines = useMemo(() => {
    if (!portfolios?.length) return [];

    return portfolios.map((portfolio, i) => {
      const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id && p.startDate && p.endDate);
      
      if (portfolioProjects.length === 0) return null;

      const earliestStart = portfolioProjects.reduce((min, p) => {
        const start = new Date(p.startDate!);
        return start < min ? start : min;
      }, new Date(portfolioProjects[0].startDate!));

      const latestEnd = portfolioProjects.reduce((max, p) => {
        const end = new Date(p.endDate!);
        return end > max ? end : max;
      }, new Date(portfolioProjects[0].endDate!));

      const avgProgress = Math.round(
        portfolioProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / portfolioProjects.length
      );

      return {
        name: portfolio.name.length > 20 ? portfolio.name.substring(0, 20) + '...' : portfolio.name,
        fullName: portfolio.name,
        projects: portfolioProjects.length,
        start: format(earliestStart, 'MMM yyyy'),
        end: format(latestEnd, 'MMM yyyy'),
        duration: differenceInDays(latestEnd, earliestStart),
        progress: avgProgress,
        color: COLORS[i % COLORS.length],
      };
    }).filter(Boolean) as any[];
  }, [portfolios, projects]);

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'Green': return '#10b981';
      case 'Yellow': return '#f59e0b';
      case 'Red': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Portfolio Timeline Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Schedule analysis and timeline visualization
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {timelineMetrics.scheduleCompliance}% On Schedule
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-on-schedule">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">On Schedule</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{timelineMetrics.onSchedule}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{timelineMetrics.scheduleCompliance}% compliance</p>
        </Card>

        <Card className="p-4" data-testid="kpi-overdue">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Overdue</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{timelineMetrics.overdue}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Past end date</p>
        </Card>

        <Card className="p-4" data-testid="kpi-avg-duration">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Duration</span>
          </div>
          <div className="text-2xl font-bold">{timelineMetrics.avgDuration}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Days per project</p>
        </Card>

        <Card className="p-4" data-testid="kpi-upcoming-milestones">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Milestone className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Upcoming</span>
          </div>
          <div className="text-2xl font-bold">{timelineMetrics.upcomingMilestones}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Due next 30 days</p>
        </Card>

        <Card className="p-4" data-testid="kpi-completed-on-time">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Flag className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Completed On-Time</span>
          </div>
          <div className="text-2xl font-bold">{timelineMetrics.completedOnTime}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Historical performance</p>
        </Card>

        <Card className="p-4" data-testid="kpi-total-tracked">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Activity className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Tracked</span>
          </div>
          <div className="text-2xl font-bold">{timelineMetrics.total}</div>
          <p className="text-[10px] text-muted-foreground mt-1">With timeline data</p>
        </Card>
      </div>

      <Card data-testid="chart-monthly-project-load">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Monthly Project Load
          </CardTitle>
          <CardDescription className="text-xs">
            Active, starting, and ending projects by month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyProjectLoad}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="shortMonth" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Area type="monotone" dataKey="active" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Active Projects" />
                <Area type="monotone" dataKey="starting" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Starting" />
                <Area type="monotone" dataKey="ending" stackId="3" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name="Ending" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-project-durations">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Project Durations
            </CardTitle>
            <CardDescription className="text-xs">
              Duration in days with progress overlay
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectTimelineData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={120} fontSize={9} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number, name: string) => [value + (name === 'Duration' ? ' days' : '%'), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="duration" fill="#e5e7eb" name="Duration" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="progress" fill="#3b82f6" name="Progress %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {portfolioTimelines.length > 0 && (
          <Card data-testid="chart-portfolio-timelines">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Portfolio Timelines
              </CardTitle>
              <CardDescription className="text-xs">
                Duration and progress by portfolio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={portfolioTimelines} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={10} />
                    <YAxis type="category" dataKey="name" width={120} fontSize={9} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                      formatter={(value: number, name: string) => [
                        name === 'Projects' ? value : value + (name === 'Duration' ? ' days' : '%'),
                        name
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="projects" fill="#3b82f6" name="Projects" />
                    <Bar dataKey="progress" fill="#10b981" name="Avg Progress %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card data-testid="card-project-timeline-details">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Project Timeline Details</CardTitle>
          <CardDescription className="text-xs">
            Schedule status and milestone tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {projectTimelineData.map((project, i) => (
              <div key={i} className="p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{project.fullName}</span>
                    {project.isOverdue ? (
                      <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">{project.status}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{project.duration} days</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                  <span>{project.start} - {project.end}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>Work Progress</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-1.5" />
                </div>
                <div className="space-y-1 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Time Elapsed</span>
                    <span className="font-medium">{project.timeProgress}%</span>
                  </div>
                  <Progress value={project.timeProgress} className="h-1.5 bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
