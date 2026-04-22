import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, XCircle, Clock, Users, AlertTriangle, 
  BarChart3, Target, TrendingUp, Calendar, ThumbsUp, ThumbsDown
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import { format, subMonths, eachMonthOfInterval, differenceInDays } from "date-fns";
import type { ProjectIntake } from "@shared/schema";

export function IntakeApprovalDashboard() {
  const { currentOrganization } = useOrganization();

  const { data: intakes = [] } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const approvalMetrics = useMemo(() => {
    const total = intakes.length;
    const approved = intakes.filter(i => i.status === 'Approved').length;
    const rejected = intakes.filter(i => i.status === 'Rejected').length;
    const pending = intakes.filter(i => 
      i.status !== 'Approved' && i.status !== 'Rejected'
    ).length;

    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    const rejectionRate = total > 0 ? Math.round((rejected / total) * 100) : 0;

    const approvalDurations = intakes
      .filter(i => i.status === 'Approved')
      .map(i => {
        if (!i.createdAt || !i.approvedAt) return null;
        const start = new Date(i.createdAt);
        const end = new Date(i.approvedAt);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
        return differenceInDays(end, start);
      })
      .filter((d): d is number => d !== null);
    const avgApprovalTime = approvalDurations.length > 0
      ? Math.round(approvalDurations.reduce((sum, d) => sum + d, 0) / approvalDurations.length)
      : 0;

    const overdueReviews = intakes.filter(i => {
      if (i.status === 'Approved' || i.status === 'Rejected') return false;
      if (!i.createdAt) return false;
      const created = new Date(i.createdAt);
      if (isNaN(created.getTime())) return false;
      return differenceInDays(new Date(), created) > 14;
    }).length;

    return {
      total,
      approved,
      rejected,
      pending,
      approvalRate,
      rejectionRate,
      avgApprovalTime,
      overdueReviews,
    };
  }, [intakes]);

  const approvalDistribution = [
    { name: 'Approved', value: approvalMetrics.approved, color: '#10b981' },
    { name: 'Rejected', value: approvalMetrics.rejected, color: '#ef4444' },
    { name: 'Pending', value: approvalMetrics.pending, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  const monthlyApprovals = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(now, 5),
      end: now,
    });

    return months.map(month => {
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const approved = intakes.filter(i => {
        if (i.status !== 'Approved' || !i.approvedAt) return false;
        const date = new Date(i.approvedAt);
        return date >= monthStart && date <= monthEnd;
      }).length;

      const rejected = intakes.filter(i => {
        if (i.status !== 'Rejected') return false;
        if (!i.createdAt) return false;
        const date = new Date(i.createdAt);
        return date >= monthStart && date <= monthEnd;
      }).length;

      return {
        month: format(month, 'MMM'),
        approved,
        rejected,
        total: approved + rejected,
      };
    });
  }, [intakes]);

  const approvalCriteria = [
    { subject: 'Strategic Fit', A: 85, fullMark: 100 },
    { subject: 'Resource Avail', A: 72, fullMark: 100 },
    { subject: 'Budget', A: 68, fullMark: 100 },
    { subject: 'Risk Level', A: 75, fullMark: 100 },
    { subject: 'Timeline', A: 80, fullMark: 100 },
    { subject: 'Business Value', A: 88, fullMark: 100 },
  ];

  const cycleTimeBreakdown = [
    { stage: 'Submission', days: 1 },
    { stage: 'Initial Review', days: 3 },
    { stage: 'Evaluation', days: 5 },
    { stage: 'Committee', days: 4 },
    { stage: 'Final Decision', days: 2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            Approval Workflow Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            <a 
              href="https://www.prince2.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              PRINCE2 stage gate approval process
            </a>
            {" analytics"}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {approvalMetrics.approvalRate}% Approval Rate
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-approved">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <ThumbsUp className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Approved</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{approvalMetrics.approved}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{approvalMetrics.approvalRate}% rate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-rejected">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <ThumbsDown className="h-4 w-4 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Rejected</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{approvalMetrics.rejected}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{approvalMetrics.rejectionRate}% rate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-pending">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{approvalMetrics.pending}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Awaiting decision</p>
        </Card>

        <Card className="p-4" data-testid="kpi-avg-time">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Time</span>
          </div>
          <div className="text-2xl font-bold">{approvalMetrics.avgApprovalTime}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Days to approve</p>
        </Card>

        <Card className="p-4" data-testid="kpi-overdue">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <AlertTriangle className="h-4 w-4 text-pink-500" />
            </div>
            <span className="text-xs text-muted-foreground">Overdue Reviews</span>
          </div>
          <div className="text-2xl font-bold text-pink-600">{approvalMetrics.overdueReviews}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{"> "}14 days pending</p>
        </Card>

        <Card className="p-4" data-testid="kpi-total">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Target className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Processed</span>
          </div>
          <div className="text-2xl font-bold">{approvalMetrics.approved + approvalMetrics.rejected}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Decisions made</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-approval-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Decision Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Overall approval outcomes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={approvalDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {approvalDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-approval-criteria">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Approval Criteria Scores
            </CardTitle>
            <CardDescription className="text-xs">
              <a 
                href="https://www.pmi.org/standards/business-analysis" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline hover:text-primary transition-colors"
              >
                PMI business case
              </a>
              {" evaluation metrics"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={approvalCriteria}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                  <Radar name="Score" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-cycle-time">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Cycle Time Breakdown
            </CardTitle>
            <CardDescription className="text-xs">
              Days at each approval stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cycleTimeBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="stage" width={80} fontSize={9} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Bar dataKey="days" fill="#3b82f6" name="Days" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="chart-monthly-approvals">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Monthly Approval Trend
          </CardTitle>
          <CardDescription className="text-xs">
            Approvals and rejections over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyApprovals}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="approved" fill="#10b981" name="Approved" stackId="a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" fill="#ef4444" name="Rejected" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
