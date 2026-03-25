import { useState, useMemo } from "react";
import { AnalyticsTab } from "./AnalyticsTab";
  import { useQuery, useMutation } from "@tanstack/react-query";
  import { queryClient, apiRequest } from "@/lib/queryClient";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Loader2, Trash2, RefreshCw, Activity, AlertTriangle, BarChart3, Database, Server, CheckCircle, XCircle, Zap, Clock, FileText, Globe, Cpu, HardDrive, Search, RotateCcw, ChevronDown, ChevronRight, TrendingUp, Eye, Wifi, WifiOff, ArrowUp, ArrowDown, Monitor, X, Users, Building2, UserPlus, Plus, Edit, CreditCard, Wallet, Settings2 } from "lucide-react";
  import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
  import { Progress } from "@/components/ui/progress";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import { format } from "date-fns";
  import { useToast } from "@/hooks/use-toast";

  interface MonitoringOverview {
  summary: {
    activeUsers24h: number;
    requestsToday: number;
    avgResponseTime: string;
    errorRate: string;
    totalUsers: number;
    totalOrganizations: number;
    totalProjects: number;
    totalErrors: number;
  };
  charts: {
    requestsPerDay: Array<{ date: string; count: number }>;
    userRegistrations: Array<{ date: string; count: number }>;
  };
  topEndpoints: Array<{ path: string; method: string; count: number; avg_duration: number }>;
  recentErrors: Array<{ path: string; status_code: number; error_message: string | null; count: number }>;
  methodBreakdown: Array<{ method: string; count: number }>;
  statusBreakdown: Array<{ status_group: string; count: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; count: number }>;
  topOrgs: Array<{ organization_id: number; org_name: string; count: number }>;
  slowestEndpoints: Array<{ path: string; method: string; avg_duration: number; count: number }>;
  filterOptions: {
    users: Array<{ user_id: string; email: string; first_name: string; last_name: string }>;
    organizations: Array<{ id: number; name: string }>;
  };
}

interface UserActivity {
  hourlyActive: Array<{ hour: string; active_users: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; request_count: number; last_activity: string }>;
  dailyLogins: Array<{ date: string; unique_users: number }>;
}

interface ActivityEntry {
  id: number;
  method: string;
  path: string;
  status_code: number;
  duration: number | null;
  user_id: string;
  organization_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  request_body: any;
  error_message: string | null;
  created_at: string;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_avatar: string | null;
  org_name: string | null;
  org_slug: string | null;
}

interface ActivityLedger {
  activities: ActivityEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  users: Array<{ user_id: string; email: string; first_name: string; last_name: string }>;
  summary: { creates: number; updates: number; deletes: number; errors: number; unique_users: number };
}

interface FeatureUsage {
  featureUsage: Array<{ feature: string; total_requests: number; get_requests: number; post_requests: number; update_requests: number; delete_requests: number }>;
  trend: Array<{ date: string; feature: string; count: number }>;
}

interface PerformanceMetrics {
  percentiles: { p50: number; p90: number; p95: number; p99: number; avg: number; max: number; min: number };
  slowEndpoints: Array<{ path: string; method: string; avg_duration: number; max_duration: number; request_count: number }>;
  responseTrend: Array<{ hour: string; avg_duration: number; request_count: number }>;
  errorTrend: Array<{ hour: string; total_requests: number; error_count: number; error_rate: number }>;
}

interface DatabaseStats {
  tableCounts: Array<{ table_name: string; row_count: number }>;
  databaseSize: string;
  tableSizes: Array<{ table_name: string; total_size: string }>;
}

interface OrgAnalyticsOrg {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  plan_code: string | null;
  plan_name: string | null;
  sub_status: string | null;
  bonus_seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
  member_count: number;
  project_count: number;
  task_count: number;
  portfolio_count: number;
  risk_count: number;
  milestone_count: number;
  issue_count: number;
  api_requests_7d: number;
}

interface OrgCreditUsage {
  org_id: number;
  meter_code: string;
  meter_name: string;
  included_units: number;
  used_units: number;
  remaining_units: number;
  overage_units: number;
  period_start: string;
  period_end: string;
  cycle_status: string;
}

interface OrgUsage {
  organizations: OrgAnalyticsOrg[];
  creditUsage: OrgCreditUsage[];
  totals: { total_orgs: number; total_users: number; total_projects: number; total_tasks: number; total_portfolios: number };
  planDistribution: Array<{ plan_name: string; plan_code: string; org_count: number }>;
}

type MonitoringSubTab = 'overview' | 'api-logs' | 'users' | 'features' | 'performance' | 'database' | 'organizations' | 'analytics';

export function MonitoringTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<MonitoringSubTab>('analytics');
  const [apiLogsPage, setApiLogsPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [pathFilter, setPathFilter] = useState<string>('');
  const [orgSortCol, setOrgSortCol] = useState<string>('name');
  const [orgSortDir, setOrgSortDir] = useState<'asc' | 'desc'>('asc');

  type OrgUsageColumnKey = 'name' | 'plan' | 'users' | 'projects' | 'tasks' | 'portfolios' | 'risks' | 'credits' | 'ai' | 'api';
  const defaultOrgUsageCols: OrgUsageColumnKey[] = ['name', 'plan', 'users', 'projects', 'tasks', 'portfolios', 'risks', 'credits', 'ai', 'api'];
  const [orgUsageCols, setOrgUsageCols] = useState<OrgUsageColumnKey[]>(defaultOrgUsageCols);
  const orgUsageColLabels: Record<OrgUsageColumnKey, string> = {
    name: 'Organization',
    plan: 'Plan',
    users: 'Users',
    projects: 'Projects',
    tasks: 'Tasks',
    portfolios: 'Portfolios',
    risks: 'Risks',
    credits: 'Credits Used',
    ai: 'AI Runs',
    api: 'API (7d)',
  };
  const toggleOrgUsageCol = (col: OrgUsageColumnKey) => {
    setOrgUsageCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };
  const hasOrgCol = (col: OrgUsageColumnKey) => orgUsageCols.includes(col);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerActionFilter, setLedgerActionFilter] = useState('');
  const [ledgerEntityFilter, setLedgerEntityFilter] = useState('');
  const [ledgerUserFilter, setLedgerUserFilter] = useState('');
  const [ledgerSortCol, setLedgerSortCol] = useState('created_at');
  const [ledgerSortDir, setLedgerSortDir] = useState<'asc' | 'desc'>('desc');
  const [ledgerDays, setLedgerDays] = useState(30);
  const [ledgerExpandedRow, setLedgerExpandedRow] = useState<number | null>(null);

  type LedgerColumnKey = 'timestamp' | 'user' | 'action' | 'details' | 'organization' | 'status' | 'duration' | 'ip' | 'userAgent' | 'method' | 'entity' | 'path';
  const defaultLedgerColumns: LedgerColumnKey[] = ['timestamp', 'user', 'action', 'details', 'organization', 'status', 'duration'];
  const [ledgerColumns, setLedgerColumns] = useState<LedgerColumnKey[]>(defaultLedgerColumns);
  const ledgerColumnLabels: Record<LedgerColumnKey, string> = {
    timestamp: 'Timestamp',
    user: 'User',
    action: 'Action',
    details: 'Details',
    organization: 'Organization',
    status: 'Status',
    duration: 'Duration',
    ip: 'IP Address',
    userAgent: 'User Agent',
    method: 'HTTP Method',
    entity: 'Entity',
    path: 'Path',
  };
  const toggleLedgerColumn = (col: LedgerColumnKey) => {
    setLedgerColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };
  const hasLedgerCol = (col: LedgerColumnKey) => ledgerColumns.includes(col);
  const visibleLedgerColCount = ledgerColumns.length + 1;

  const [ovDays, setOvDays] = useState(1);
  const [ovMethod, setOvMethod] = useState('');
  const [ovStatus, setOvStatus] = useState('');
  const [ovPath, setOvPath] = useState('');
  const [ovUserId, setOvUserId] = useState('');
  const [ovOrgId, setOvOrgId] = useState('');

  const ovQueryString = new URLSearchParams({
    days: String(ovDays),
    ...(ovMethod && { method: ovMethod }),
    ...(ovStatus && { status: ovStatus }),
    ...(ovPath && { path: ovPath }),
    ...(ovUserId && { userId: ovUserId }),
    ...(ovOrgId && { orgId: ovOrgId }),
  }).toString();

  const { data: overview, isLoading: overviewLoading, isFetching: overviewFetching, refetch: refetchOverview } = useQuery<MonitoringOverview>({
    queryKey: ['/api/admin/monitoring/overview', ovDays, ovMethod, ovStatus, ovPath, ovUserId, ovOrgId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/monitoring/overview?${ovQueryString}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`Failed to fetch overview: ${r.status}`);
      return r.json();
    },
    staleTime: 0,
  });

  const { data: userActivity, isLoading: activityLoading, refetch: refetchActivity } = useQuery<UserActivity>({
    queryKey: ['/api/admin/monitoring/user-activity'],
    enabled: subTab === 'users',
    staleTime: 0,
  });

  const { data: featureUsage, isLoading: featuresLoading, refetch: refetchFeatures } = useQuery<FeatureUsage>({
    queryKey: ['/api/admin/monitoring/feature-usage'],
    enabled: subTab === 'features',
    staleTime: 0,
  });

  const { data: performance, isLoading: perfLoading, refetch: refetchPerf } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/admin/monitoring/performance'],
    enabled: subTab === 'performance',
    staleTime: 0,
  });

  const { data: databaseStats, isLoading: dbLoading, refetch: refetchDb } = useQuery<DatabaseStats>({
    queryKey: ['/api/admin/monitoring/database'],
    enabled: subTab === 'database',
    staleTime: 0,
  });

  const { data: orgUsage, isLoading: orgLoading, refetch: refetchOrg } = useQuery<OrgUsage>({
    queryKey: ['/api/admin/monitoring/organization-usage'],
    enabled: subTab === 'organizations',
    staleTime: 0,
  });

  const ledgerQueryString = new URLSearchParams({
    page: String(ledgerPage),
    limit: '50',
    search: ledgerSearch,
    action: ledgerActionFilter,
    entity: ledgerEntityFilter,
    userId: ledgerUserFilter,
    sortCol: ledgerSortCol,
    sortDir: ledgerSortDir,
    days: String(ledgerDays),
  }).toString();

  const { data: activityLedger, isLoading: ledgerLoading, refetch: refetchLedger } = useQuery<ActivityLedger>({
    queryKey: ['/api/admin/monitoring/activity-ledger', ledgerQueryString],
    queryFn: async () => {
      const res = await fetch(`/api/admin/monitoring/activity-ledger?${ledgerQueryString}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch activity ledger');
      return res.json();
    },
    enabled: subTab === 'users',
    staleTime: 0,
  });

  const handleRefresh = () => {
    refetchOverview();
    if (subTab === 'users') { refetchActivity(); refetchLedger(); }
    if (subTab === 'features') refetchFeatures();
    if (subTab === 'performance') refetchPerf();
    if (subTab === 'database') refetchDb();
    if (subTab === 'organizations') refetchOrg();
    toast({ title: "Data refreshed" });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return '-';
    return `${Math.round(ms)}ms`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'MMM d, h:mm a');
    } catch {
      return dateStr;
    }
  };

  const ovHasFilters = ovMethod || ovStatus || ovPath || ovUserId || ovOrgId || ovDays !== 1;
  const ovClearFilters = () => {
    setOvDays(1);
    setOvMethod('');
    setOvStatus('');
    setOvPath('');
    setOvUserId('');
    setOvOrgId('');
  };
  const ovTimeLabel = ovDays === 1 ? '24h' : ovDays === 7 ? '7d' : ovDays === 14 ? '14d' : ovDays === 30 ? '30d' : ovDays === 90 ? '90d' : `${ovDays}d`;

  const renderOverview = () => {
    if (overviewLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!overview) {
      return (
        <div className="text-center text-muted-foreground py-8">
          No monitoring data available yet. API requests will be tracked automatically.
        </div>
      );
    }

    const filterUsers = overview.filterOptions?.users ?? [];
    const filterOrgs = overview.filterOptions?.organizations ?? [];
    const methodBreakdown = overview.methodBreakdown ?? [];
    const statusBreakdown = overview.statusBreakdown ?? [];
    const ovTopUsers = overview.topUsers ?? [];
    const ovTopOrgs = overview.topOrgs ?? [];
    const slowEndpoints = overview.slowestEndpoints ?? [];

    return (
      <div className="space-y-6">
        <Card data-testid="card-overview-filters">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(ovDays)} onValueChange={(v) => setOvDays(Number(v))}>
                <SelectTrigger className="w-[100px] sm:w-[120px]" data-testid="select-ov-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ovMethod || 'all'} onValueChange={(v) => setOvMethod(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[100px] sm:w-[120px]" data-testid="select-ov-method">
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ovStatus || 'all'} onValueChange={(v) => setOvStatus(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[110px] sm:w-[130px]" data-testid="select-ov-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="2xx">2xx Success</SelectItem>
                  <SelectItem value="3xx">3xx Redirect</SelectItem>
                  <SelectItem value="4xx">4xx Client Error</SelectItem>
                  <SelectItem value="5xx">5xx Server Error</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative min-w-[140px] sm:min-w-[180px] flex-1 max-w-[280px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by path..."
                  value={ovPath}
                  onChange={(e) => setOvPath(e.target.value)}
                  className="pl-8"
                  data-testid="input-ov-path"
                />
              </div>
              <Select value={ovUserId || 'all'} onValueChange={(v) => setOvUserId(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-ov-user">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {filterUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ovOrgId || 'all'} onValueChange={(v) => setOvOrgId(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-ov-org">
                  <SelectValue placeholder="Organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {filterOrgs.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ovHasFilters && (
                <Button variant="ghost" size="sm" onClick={ovClearFilters} className="text-muted-foreground" data-testid="btn-ov-clear">
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              {overviewFetching && !overviewLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="hover-elevate" data-testid="card-active-users">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Active Users
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.activeUsers24h)}</div>
              <div className="text-xs text-muted-foreground">{ovTimeLabel}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-requests-today">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Globe className="h-4 w-4" />
                Requests
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.requestsToday)}</div>
              <div className="text-xs text-muted-foreground">{ovTimeLabel}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-avg-response">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Zap className="h-4 w-4" />
                Avg Response
              </div>
              <div className="text-2xl font-bold mt-1">{overview.summary.avgResponseTime}</div>
              <div className="text-xs text-muted-foreground">{ovTimeLabel}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-error-rate">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <AlertTriangle className="h-4 w-4" />
                Error Rate
              </div>
              <div className="text-2xl font-bold mt-1">{overview.summary.errorRate}</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overview.summary.totalErrors)} errors</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-total-users">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Total Users
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.totalUsers)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-total-orgs">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Building2 className="h-4 w-4" />
                Organizations
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.totalOrganizations)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-total-projects">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <BarChart3 className="h-4 w-4" />
                Projects
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.totalProjects)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Method Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {methodBreakdown.length > 0 ? methodBreakdown.map((m, i) => {
                  const methodColors: Record<string, string> = { GET: 'bg-blue-500', POST: 'bg-green-500', PUT: 'bg-amber-500', PATCH: 'bg-orange-500', DELETE: 'bg-red-500' };
                  const maxCount = Math.max(...methodBreakdown.map(x => Number(x.count)));
                  const pct = maxCount > 0 ? (Number(m.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2" data-testid={`bar-method-${i}`}>
                      <span className="text-xs font-medium w-14">{m.method}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className={`h-full ${methodColors[m.method] || 'bg-muted-foreground'} transition-all duration-300`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{formatNumber(Number(m.count))}</span>
                    </div>
                  );
                }) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statusBreakdown.length > 0 ? statusBreakdown.map((s, i) => {
                  const statusColors: Record<string, string> = { '2xx': 'bg-green-500', '3xx': 'bg-blue-400', '4xx': 'bg-amber-500', '5xx': 'bg-red-500' };
                  const maxCount = Math.max(...statusBreakdown.map(x => Number(x.count)));
                  const pct = maxCount > 0 ? (Number(s.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2" data-testid={`bar-status-${i}`}>
                      <span className="text-xs font-medium w-14">{s.status_group}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className={`h-full ${statusColors[s.status_group] || 'bg-muted-foreground'} transition-all duration-300`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{formatNumber(Number(s.count))}</span>
                    </div>
                  );
                }) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top Users ({ovTimeLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {ovTopUsers.length > 0 ? ovTopUsers.slice(0, 6).map((u, i) => (
                  <div key={i} className="flex items-center justify-between text-sm" data-testid={`row-ov-user-${i}`}>
                    <span className="truncate text-xs">
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : (u.email || 'Unknown')}
                    </span>
                    <Badge variant="secondary" className="text-xs ml-1 shrink-0">{formatNumber(Number(u.count))}</Badge>
                  </div>
                )) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top Organizations ({ovTimeLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {ovTopOrgs.length > 0 ? ovTopOrgs.slice(0, 6).map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-sm" data-testid={`row-ov-org-${i}`}>
                    <span className="truncate text-xs">{o.org_name || 'Unknown'}</span>
                    <Badge variant="secondary" className="text-xs ml-1 shrink-0">{formatNumber(Number(o.count))}</Badge>
                  </div>
                )) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Top Endpoints ({ovTimeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Avg Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.topEndpoints?.slice(0, 10).map((ep, i) => (
                    <TableRow key={i} data-testid={`row-endpoint-${i}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{ep.path}</TableCell>
                      <TableCell>
                        <Badge variant={ep.method === 'GET' ? 'secondary' : ep.method === 'POST' ? 'default' : 'outline'}>
                          {ep.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(Number(ep.count))}</TableCell>
                      <TableCell className="text-right">{formatDuration(ep.avg_duration)}</TableCell>
                    </TableRow>
                  ))}
                  {(!overview.topEndpoints || overview.topEndpoints.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">No data yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Errors ({ovTimeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.recentErrors?.slice(0, 10).map((err, i) => (
                    <TableRow key={i} data-testid={`row-error-${i}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{err.path}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{err.status_code}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(Number(err.count))}</TableCell>
                    </TableRow>
                  ))}
                  {(!overview.recentErrors || overview.recentErrors.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">No errors</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-amber-500" />
                Slowest Endpoints ({ovTimeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Avg Time</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowEndpoints.slice(0, 8).map((ep, i) => (
                    <TableRow key={i} data-testid={`row-slow-${i}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{ep.path}</TableCell>
                      <TableCell>
                        <Badge variant={ep.method === 'GET' ? 'secondary' : ep.method === 'POST' ? 'default' : 'outline'}>
                          {ep.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatDuration(ep.avg_duration)}</TableCell>
                      <TableCell className="text-right">{formatNumber(Number(ep.count))}</TableCell>
                    </TableRow>
                  ))}
                  {slowEndpoints.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">No data yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Requests Per Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.charts.requestsPerDay?.slice(0, 14).map((day, i) => {
                  const maxCount = Math.max(...overview.charts.requestsPerDay.map(d => Number(d.count)));
                  const percentage = maxCount > 0 ? (Number(day.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3" data-testid={`bar-requests-${i}`}>
                      <span className="text-xs text-muted-foreground w-24">{format(new Date(day.date), 'MMM d')}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{formatNumber(Number(day.count))}</span>
                    </div>
                  );
                })}
                {(!overview.charts.requestsPerDay || overview.charts.requestsPerDay.length === 0) && (
                  <div className="text-center text-muted-foreground py-4">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              User Registrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.charts.userRegistrations?.slice(0, 14).map((day, i) => {
                const maxCount = Math.max(...overview.charts.userRegistrations.map(d => Number(d.count)));
                const percentage = maxCount > 0 ? (Number(day.count) / maxCount) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3" data-testid={`bar-registrations-${i}`}>
                    <span className="text-xs text-muted-foreground w-24">{format(new Date(day.date), 'MMM d')}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${percentage}%` }} />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{formatNumber(Number(day.count))}</span>
                  </div>
                );
                })}
                {(!overview.charts.userRegistrations || overview.charts.userRegistrations.length === 0) && (
                  <div className="text-center text-muted-foreground py-4">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>
      </div>
    );
  };

  const getActionLabel = (method: string) => {
    switch (method) {
      case 'POST': return 'Created';
      case 'PUT': return 'Updated';
      case 'PATCH': return 'Modified';
      case 'DELETE': return 'Deleted';
      default: return method;
    }
  };

  const getActionColor = (method: string) => {
    switch (method) {
      case 'POST': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'PUT': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'PATCH': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getEntityFromPath = (path: string): string => {
    const match = path.match(/^\/api\/(?:admin\/)?([^/]+)/);
    if (!match) return 'Unknown';
    const raw = match[1];
    const labels: Record<string, string> = {
      'projects': 'Project', 'portfolios': 'Portfolio', 'tasks': 'Task',
      'risks': 'Risk', 'issues': 'Issue', 'milestones': 'Key Date',
      'organizations': 'Organization', 'users': 'User', 'resources': 'Resource',
      'timesheets': 'Timesheet', 'invoices': 'Invoice', 'notifications': 'Notification',
      'billing': 'Billing', 'consents': 'Consent', 'help-tickets': 'Help Ticket',
      'demo-data': 'Demo Data', 'ai': 'AI', 'auth': 'Auth', 'planner': 'Planner',
      'mpp-imports': 'MPP Import', 'custom-dashboards': 'Dashboard',
      'project-intakes': 'Intake', 'change-requests': 'Change Request',
      'dynamics365': 'Dynamics 365', 'dataverse': 'Dataverse',
      'chat': 'AI Chat', 'plans': 'Plan', 'paypal': 'PayPal',
      'lessons-learned': 'Lesson', 'project-documents': 'Document',
    };
    return labels[raw] || raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, ' ');
  };

  const getEntityId = (path: string): string | null => {
    const match = path.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
  };

  const getActivityDescription = (entry: ActivityEntry): string => {
    const entity = getEntityFromPath(entry.path);
    const entityId = getEntityId(entry.path);
    const action = getActionLabel(entry.method);
    const subAction = entry.path.split('/').pop();
    const isSubAction = subAction && !subAction.match(/^\d+$/) && entry.path.split('/').length > 4;
    
    if (isSubAction && subAction) {
      const subLabel = subAction.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `${action} ${entity} ${subLabel}${entityId ? ` #${entityId}` : ''}`;
    }
    return `${action} ${entity}${entityId ? ` #${entityId}` : ''}`;
  };

  const getStatusBadgeVariant = (code: number): "default" | "secondary" | "destructive" | "outline" => {
    if (code >= 200 && code < 300) return 'secondary';
    if (code >= 300 && code < 400) return 'outline';
    if (code >= 400 && code < 500) return 'destructive';
    if (code >= 500) return 'destructive';
    return 'outline';
  };

  const toggleLedgerSort = (col: string) => {
    if (ledgerSortCol === col) {
      setLedgerSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setLedgerSortCol(col);
      setLedgerSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
    setLedgerPage(1);
  };

  const renderUserActivity = () => {
    if (activityLoading || ledgerLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    const summary = activityLedger?.summary;
    const activities = activityLedger?.activities ?? [];
    const pagination = activityLedger?.pagination;
    const availableUsers = activityLedger?.users ?? [];

    const LedgerSortHead = ({ col, children, align }: { col: string; children: React.ReactNode; align?: string }) => (
      <TableHead
        className={`cursor-pointer select-none hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : ''}`}
        onClick={() => toggleLedgerSort(col)}
        data-testid={`sort-ledger-${col}`}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {children}
          {ledgerSortCol === col ? (
            ledgerSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : null}
        </div>
      </TableHead>
    );

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <Card data-testid="kpi-activity-creates">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-green-600">
                <Plus className="h-3.5 w-3.5" />
                Creates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.creates ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-updates">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-blue-600">
                <Edit className="h-3.5 w-3.5" />
                Updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.updates ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-deletes">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
                Deletes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.deletes ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-errors">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Errors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.errors ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-unique-users">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Active Users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.unique_users ?? 0))}</div>
            </CardContent>
          </Card>
        </div>

        {userActivity && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Most Active Users (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {userActivity.topUsers?.slice(0, 8).map((user, i) => (
                    <div key={i} className="flex items-center justify-between text-sm" data-testid={`row-active-user-${i}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">
                          {user.first_name || user.last_name 
                            ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                            : 'Unknown'}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">{user.email || '-'}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs ml-2 shrink-0">{formatNumber(Number(user.request_count))}</Badge>
                    </div>
                  ))}
                  {(!userActivity.topUsers || userActivity.topUsers.length === 0) && (
                    <div className="text-center text-muted-foreground text-sm py-2">No data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Active Users By Hour (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {userActivity.hourlyActive?.slice(0, 8).map((hour, i) => {
                    const maxCount = Math.max(...userActivity.hourlyActive.map(h => Number(h.active_users)));
                    const percentage = maxCount > 0 ? (Number(hour.active_users) / maxCount) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-2" data-testid={`bar-hourly-${i}`}>
                        <span className="text-xs text-muted-foreground w-16">{format(new Date(hour.hour), 'h:mm a')}</span>
                        <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{Number(hour.active_users)}</span>
                      </div>
                    );
                  })}
                  {(!userActivity.hourlyActive || userActivity.hourlyActive.length === 0) && (
                    <div className="text-center text-muted-foreground text-sm py-2">No data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card data-testid="card-activity-ledger">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Activity Ledger
                </CardTitle>
                <CardDescription>
                  Complete log of all user actions ({formatNumber(pagination?.total ?? 0)} entries)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="btn-ledger-columns">
                      <Settings2 className="h-4 w-4 mr-1" />
                      Fields
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Visible Fields</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(Object.keys(ledgerColumnLabels) as LedgerColumnKey[]).map(col => (
                      <DropdownMenuCheckboxItem
                        key={col}
                        checked={hasLedgerCol(col)}
                        onCheckedChange={() => toggleLedgerColumn(col)}
                        data-testid={`toggle-ledger-col-${col}`}
                      >
                        {ledgerColumnLabels[col]}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLedgerColumns(defaultLedgerColumns)}
                      data-testid="btn-ledger-reset-cols"
                    >
                      Reset to Default
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Badge variant="secondary" className="text-xs">
                  Last {ledgerDays} days
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users, paths, organizations..."
                  value={ledgerSearch}
                  onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                  className="pl-8"
                  data-testid="input-ledger-search"
                />
              </div>
              <Select value={ledgerActionFilter} onValueChange={(v) => { setLedgerActionFilter(v === 'all' ? '' : v); setLedgerPage(1); }}>
                <SelectTrigger className="w-[110px] sm:w-[130px]" data-testid="select-ledger-action">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">Creates</SelectItem>
                  <SelectItem value="update">Updates</SelectItem>
                  <SelectItem value="delete">Deletes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ledgerEntityFilter} onValueChange={(v) => { setLedgerEntityFilter(v === 'all' ? '' : v); setLedgerPage(1); }}>
                <SelectTrigger className="w-[120px] sm:w-[150px]" data-testid="select-ledger-entity">
                  <SelectValue placeholder="Entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  <SelectItem value="projects">Projects</SelectItem>
                  <SelectItem value="portfolios">Portfolios</SelectItem>
                  <SelectItem value="tasks">Tasks</SelectItem>
                  <SelectItem value="risks">Risks</SelectItem>
                  <SelectItem value="issues">Issues</SelectItem>
                  <SelectItem value="milestones">Key Dates</SelectItem>
                  <SelectItem value="organizations">Organizations</SelectItem>
                  <SelectItem value="resources">Resources</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="auth">Auth</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="demo-data">Demo Data</SelectItem>
                  <SelectItem value="help-tickets">Help Tickets</SelectItem>
                  <SelectItem value="plans">Plans</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ledgerUserFilter} onValueChange={(v) => { setLedgerUserFilter(v === 'all' ? '' : v); setLedgerPage(1); }}>
                <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-ledger-user">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {availableUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(ledgerDays)} onValueChange={(v) => { setLedgerDays(Number(v)); setLedgerPage(1); }}>
                <SelectTrigger className="w-[120px]" data-testid="select-ledger-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {ledgerLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No activities found for the current filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {hasLedgerCol('timestamp') && <LedgerSortHead col="created_at">Timestamp</LedgerSortHead>}
                        {hasLedgerCol('user') && <LedgerSortHead col="user">User</LedgerSortHead>}
                        {hasLedgerCol('action') && <TableHead>Action</TableHead>}
                        {hasLedgerCol('method') && <TableHead>HTTP Method</TableHead>}
                        {hasLedgerCol('details') && <LedgerSortHead col="path">Details</LedgerSortHead>}
                        {hasLedgerCol('entity') && <TableHead>Entity</TableHead>}
                        {hasLedgerCol('path') && <TableHead>Path</TableHead>}
                        {hasLedgerCol('organization') && <TableHead>Organization</TableHead>}
                        {hasLedgerCol('status') && <LedgerSortHead col="status" align="right">Status</LedgerSortHead>}
                        {hasLedgerCol('duration') && <LedgerSortHead col="duration" align="right">Duration</LedgerSortHead>}
                        {hasLedgerCol('ip') && <TableHead>IP Address</TableHead>}
                        {hasLedgerCol('userAgent') && <TableHead>User Agent</TableHead>}
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((entry) => (
                        <>
                          <TableRow
                            key={entry.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setLedgerExpandedRow(ledgerExpandedRow === entry.id ? null : entry.id)}
                            data-testid={`row-activity-${entry.id}`}
                          >
                            {hasLedgerCol('timestamp') && (
                              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                {format(new Date(entry.created_at), 'MMM d, h:mm:ss a')}
                              </TableCell>
                            )}
                            {hasLedgerCol('user') && (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                                    {(entry.user_first_name || entry.user_email || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {entry.user_first_name || entry.user_last_name
                                        ? `${entry.user_first_name || ''} ${entry.user_last_name || ''}`.trim()
                                        : 'Unknown'}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{entry.user_email}</div>
                                  </div>
                                </div>
                              </TableCell>
                            )}
                            {hasLedgerCol('action') && (
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getActionColor(entry.method)}`}>
                                  {getActionLabel(entry.method)}
                                </span>
                              </TableCell>
                            )}
                            {hasLedgerCol('method') && (
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-mono">{entry.method}</Badge>
                              </TableCell>
                            )}
                            {hasLedgerCol('details') && (
                              <TableCell>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">{getActivityDescription(entry)}</div>
                                  <div className="text-xs text-muted-foreground font-mono truncate max-w-[250px]">{entry.path}</div>
                                </div>
                              </TableCell>
                            )}
                            {hasLedgerCol('entity') && (
                              <TableCell className="text-sm">{getEntityFromPath(entry.path)}</TableCell>
                            )}
                            {hasLedgerCol('path') && (
                              <TableCell className="font-mono text-xs max-w-[250px] truncate">{entry.path}</TableCell>
                            )}
                            {hasLedgerCol('organization') && (
                              <TableCell className="text-sm text-muted-foreground">
                                {entry.org_name || '-'}
                              </TableCell>
                            )}
                            {hasLedgerCol('status') && (
                              <TableCell className="text-right">
                                <Badge variant={getStatusBadgeVariant(entry.status_code)} className="text-xs font-mono">
                                  {entry.status_code}
                                </Badge>
                              </TableCell>
                            )}
                            {hasLedgerCol('duration') && (
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {entry.duration !== null ? `${entry.duration}ms` : '-'}
                              </TableCell>
                            )}
                            {hasLedgerCol('ip') && (
                              <TableCell className="text-xs font-mono text-muted-foreground">{entry.ip_address || '-'}</TableCell>
                            )}
                            {hasLedgerCol('userAgent') && (
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{entry.user_agent || '-'}</TableCell>
                            )}
                            <TableCell>
                              {ledgerExpandedRow === entry.id ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                          </TableRow>
                          {ledgerExpandedRow === entry.id && (
                            <TableRow key={`${entry.id}-detail`}>
                              <TableCell colSpan={visibleLedgerColCount} className="bg-muted/30 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                  <div className="space-y-2">
                                    <div>
                                      <span className="text-muted-foreground">User ID:</span>
                                      <span className="ml-2 font-mono text-xs">{entry.user_id}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">IP Address:</span>
                                      <span className="ml-2 font-mono text-xs">{entry.ip_address || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Organization:</span>
                                      <span className="ml-2">{entry.org_name ? `${entry.org_name} (${entry.org_slug})` : 'N/A'}</span>
                                    </div>
                                    {entry.error_message && (
                                      <div>
                                        <span className="text-destructive font-medium">Error:</span>
                                        <span className="ml-2 text-destructive">{entry.error_message}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <div>
                                      <span className="text-muted-foreground">Full Path:</span>
                                      <span className="ml-2 font-mono text-xs break-all">{entry.path}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">User Agent:</span>
                                      <span className="ml-2 text-xs truncate block max-w-full">{entry.user_agent || 'N/A'}</span>
                                    </div>
                                    {entry.request_body && Object.keys(entry.request_body).length > 0 && (
                                      <div>
                                        <span className="text-muted-foreground">Request Body:</span>
                                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
                                          {JSON.stringify(entry.request_body, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages} ({formatNumber(pagination.total)} entries)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                        data-testid="btn-ledger-prev"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setLedgerPage(p => p + 1)}
                        data-testid="btn-ledger-next"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderFeatureUsage = () => {
    if (featuresLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!featureUsage) {
      return <div className="text-center text-muted-foreground py-8">No feature usage data yet</div>;
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Feature Usage (Last 7 Days)
            </CardTitle>
            <CardDescription>API requests grouped by feature area</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">GET</TableHead>
                  <TableHead className="text-right">POST</TableHead>
                  <TableHead className="text-right">UPDATE</TableHead>
                  <TableHead className="text-right">DELETE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureUsage.featureUsage?.map((feature, i) => (
                  <TableRow key={i} data-testid={`row-feature-${i}`}>
                    <TableCell className="font-medium">{feature.feature}</TableCell>
                    <TableCell className="text-right font-bold">{formatNumber(Number(feature.total_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.get_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.post_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.update_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.delete_requests))}</TableCell>
                  </TableRow>
                ))}
                {(!featureUsage.featureUsage || featureUsage.featureUsage.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No data yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPerformance = () => {
    if (perfLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!performance) {
      return <div className="text-center text-muted-foreground py-8">No performance data yet</div>;
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P50</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p50)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P90</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p90)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P95</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p95)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P99</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p99)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">Average</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.avg)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">Min</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.min)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">Max</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.max)}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Slowest Endpoints (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Avg Time</TableHead>
                  <TableHead className="text-right">Max Time</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.slowEndpoints?.map((ep, i) => (
                  <TableRow key={i} data-testid={`row-slow-endpoint-${i}`}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">{ep.path}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ep.method}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatDuration(ep.avg_duration)}</TableCell>
                    <TableCell className="text-right text-amber-600">{formatDuration(ep.max_duration)}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(ep.request_count))}</TableCell>
                  </TableRow>
                ))}
                {(!performance.slowEndpoints || performance.slowEndpoints.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No data yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Error Rate By Hour (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {performance.errorTrend?.slice(0, 12).map((hour, i) => {
                const errorRate = Number(hour.error_rate) || 0;
                return (
                  <div key={i} className="flex items-center gap-3" data-testid={`bar-error-${i}`}>
                    <span className="text-xs text-muted-foreground w-24">{format(new Date(hour.hour), 'h:mm a')}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${errorRate > 5 ? 'bg-destructive' : errorRate > 1 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(errorRate * 10, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{errorRate.toFixed(1)}%</span>
                  </div>
                );
              })}
              {(!performance.errorTrend || performance.errorTrend.length === 0) && (
                <div className="text-center text-muted-foreground py-4">No data yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderDatabase = () => {
    if (dbLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!databaseStats) {
      return <div className="text-center text-muted-foreground py-8">No database stats available</div>;
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Database Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted text-center">
              <div className="text-muted-foreground">Total Database Size</div>
              <div className="text-3xl font-bold mt-1">{databaseStats.databaseSize}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Table Row Counts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databaseStats.tableCounts?.map((table, i) => (
                    <TableRow key={i} data-testid={`row-table-count-${i}`}>
                      <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                      <TableCell className="text-right">{formatNumber(Number(table.row_count))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5" />
                Table Sizes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databaseStats.tableSizes?.map((table, i) => (
                    <TableRow key={i} data-testid={`row-table-size-${i}`}>
                      <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                      <TableCell className="text-right">{table.total_size}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderOrgUsage = () => {
    if (orgLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!orgUsage) {
      return <div className="text-center text-muted-foreground py-8">No organization usage data yet</div>;
    }

    const totals = orgUsage.totals;
    const orgs = orgUsage.organizations ?? [];
    const creditsByOrg = new Map<number, OrgCreditUsage[]>();
    (orgUsage.creditUsage ?? []).forEach(cu => {
      const list = creditsByOrg.get(cu.org_id) ?? [];
      list.push(cu);
      creditsByOrg.set(cu.org_id, list);
    });

    const totalObjects = Number(totals?.total_projects ?? 0) + Number(totals?.total_tasks ?? 0) + Number(totals?.total_portfolios ?? 0);

    const getCreditsUsed = (orgId: number) => {
      const credits = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'credits');
      return credits ? Number(credits.used_units) : 0;
    };
    const getCreditsIncluded = (orgId: number) => {
      const credits = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'credits');
      return credits ? Number(credits.included_units) : 0;
    };
    const getAiRunsUsed = (orgId: number) => {
      const ai = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'ai_runs');
      return ai ? Number(ai.used_units) : 0;
    };
    const getAiRunsIncluded = (orgId: number) => {
      const ai = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'ai_runs');
      return ai ? Number(ai.included_units) : 0;
    };

    const getPlanVariant = (code: string | null): "default" | "secondary" | "outline" | "destructive" => {
      switch (code) {
        case 'ENTERPRISE': return 'default';
        case 'TEAM': return 'default';
        case 'BASIC': return 'secondary';
        case 'CUSTOM': return 'outline';
        case 'FREE': return 'secondary';
        default: return 'destructive';
      }
    };

    const toggleOrgSort = (col: string) => {
      if (orgSortCol === col) {
        setOrgSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setOrgSortCol(col);
        setOrgSortDir('asc');
      }
    };

    const sortedOrgs = [...orgs].sort((a, b) => {
      const dir = orgSortDir === 'asc' ? 1 : -1;
      switch (orgSortCol) {
        case 'name': return dir * (a.name ?? '').localeCompare(b.name ?? '');
        case 'plan': return dir * (a.plan_name ?? '').localeCompare(b.plan_name ?? '');
        case 'users': return dir * (Number(a.member_count) - Number(b.member_count));
        case 'projects': return dir * (Number(a.project_count) - Number(b.project_count));
        case 'tasks': return dir * (Number(a.task_count) - Number(b.task_count));
        case 'portfolios': return dir * (Number(a.portfolio_count) - Number(b.portfolio_count));
        case 'risks': return dir * (Number(a.risk_count) - Number(b.risk_count));
        case 'credits': return dir * (getCreditsUsed(a.id) - getCreditsUsed(b.id));
        case 'ai': return dir * (getAiRunsUsed(a.id) - getAiRunsUsed(b.id));
        case 'api': return dir * (Number(a.api_requests_7d) - Number(b.api_requests_7d));
        default: return 0;
      }
    });

    const SortHeader = ({ col, children, align }: { col: string; children: React.ReactNode; align?: string }) => (
      <TableHead
        className={`cursor-pointer select-none hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : ''}`}
        onClick={() => toggleOrgSort(col)}
        data-testid={`sort-org-${col}`}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {children}
          {orgSortCol === col ? (
            orgSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />
          )}
        </div>
      </TableHead>
    );

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <Card data-testid="kpi-total-orgs">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Organizations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_orgs ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-users">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Total Users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_users ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-projects">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_projects ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-tasks">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                Tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_tasks ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-objects">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Total Objects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(totalObjects)}</div>
              <p className="text-xs text-muted-foreground mt-1">Projects + Tasks + Portfolios</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2" data-testid="card-plan-distribution">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Plan Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {(orgUsage.planDistribution ?? []).map((pd) => (
                  <Badge
                    key={pd.plan_code}
                    variant={getPlanVariant(pd.plan_code)}
                    className="text-sm px-3 py-1.5 gap-1.5"
                    data-testid={`plan-dist-${pd.plan_code}`}
                  >
                    <span className="font-semibold text-base">{Number(pd.org_count)}</span>
                    {pd.plan_name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-credit-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Credits This Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const totalCreditsUsed = orgs.reduce((sum, org) => sum + getCreditsUsed(org.id), 0);
                const totalCreditsIncluded = orgs.reduce((sum, org) => sum + getCreditsIncluded(org.id), 0);
                const totalAiUsed = orgs.reduce((sum, org) => sum + getAiRunsUsed(org.id), 0);
                const totalAiIncluded = orgs.reduce((sum, org) => sum + getAiRunsIncluded(org.id), 0);
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Credits</span>
                        <span className="font-medium">{formatNumber(totalCreditsUsed)} / {formatNumber(totalCreditsIncluded)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${totalCreditsIncluded > 0 ? Math.min((totalCreditsUsed / totalCreditsIncluded) * 100, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">AI Runs</span>
                        <span className="font-medium">{formatNumber(totalAiUsed)} / {formatNumber(totalAiIncluded)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${totalAiIncluded > 0 ? Math.min((totalAiUsed / totalAiIncluded) * 100, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-org-details-table">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Details
                </CardTitle>
                <CardDescription>Comprehensive overview of all active organizations</CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="btn-org-usage-columns">
                    <Settings2 className="h-4 w-4 mr-1" />
                    Fields
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Visible Fields</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(orgUsageColLabels) as OrgUsageColumnKey[]).map(col => (
                    <DropdownMenuCheckboxItem
                      key={col}
                      checked={hasOrgCol(col)}
                      onCheckedChange={() => toggleOrgUsageCol(col)}
                      data-testid={`toggle-org-col-${col}`}
                    >
                      {orgUsageColLabels[col]}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setOrgUsageCols(defaultOrgUsageCols)}
                    data-testid="btn-org-reset-cols"
                  >
                    Reset to Default
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {hasOrgCol('name') && <SortHeader col="name">Organization</SortHeader>}
                    {hasOrgCol('plan') && <SortHeader col="plan">Plan</SortHeader>}
                    {hasOrgCol('users') && <SortHeader col="users" align="right">Users</SortHeader>}
                    {hasOrgCol('projects') && <SortHeader col="projects" align="right">Projects</SortHeader>}
                    {hasOrgCol('tasks') && <SortHeader col="tasks" align="right">Tasks</SortHeader>}
                    {hasOrgCol('portfolios') && <SortHeader col="portfolios" align="right">Portfolios</SortHeader>}
                    {hasOrgCol('risks') && <SortHeader col="risks" align="right">Risks</SortHeader>}
                    {hasOrgCol('credits') && <SortHeader col="credits" align="right">Credits Used</SortHeader>}
                    {hasOrgCol('ai') && <SortHeader col="ai" align="right">AI Runs</SortHeader>}
                    {hasOrgCol('api') && <SortHeader col="api" align="right">API (7d)</SortHeader>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOrgs.map((org) => {
                    const creditsUsed = getCreditsUsed(org.id);
                    const creditsIncluded = getCreditsIncluded(org.id);
                    const aiUsed = getAiRunsUsed(org.id);
                    const aiIncluded = getAiRunsIncluded(org.id);
                    const creditPct = creditsIncluded > 0 ? (creditsUsed / creditsIncluded) * 100 : 0;
                    return (
                      <TableRow key={org.id} data-testid={`row-org-usage-${org.id}`}>
                        {hasOrgCol('name') && (
                          <TableCell>
                            <a
                              href={`/organizations/${org.id}`}
                              className="block hover:underline"
                              data-testid={`link-org-${org.id}`}
                            >
                              <div className="font-medium text-primary">{org.name}</div>
                              <div className="text-xs text-muted-foreground">{org.slug}</div>
                            </a>
                          </TableCell>
                        )}
                        {hasOrgCol('plan') && (
                          <TableCell>
                            <Badge variant={getPlanVariant(org.plan_code)} className="text-xs">
                              {org.plan_name || 'No Plan'}
                            </Badge>
                          </TableCell>
                        )}
                        {hasOrgCol('users') && <TableCell className="text-right">{formatNumber(Number(org.member_count))}</TableCell>}
                        {hasOrgCol('projects') && <TableCell className="text-right">{formatNumber(Number(org.project_count))}</TableCell>}
                        {hasOrgCol('tasks') && <TableCell className="text-right">{formatNumber(Number(org.task_count))}</TableCell>}
                        {hasOrgCol('portfolios') && <TableCell className="text-right">{formatNumber(Number(org.portfolio_count))}</TableCell>}
                        {hasOrgCol('risks') && <TableCell className="text-right">{formatNumber(Number(org.risk_count))}</TableCell>}
                        {hasOrgCol('credits') && (
                          <TableCell className="text-right">
                            {creditsIncluded > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className={creditPct > 80 ? 'text-destructive font-semibold' : ''}>
                                  {creditsUsed.toLocaleString()}
                                </span>
                                <span className="text-xs text-muted-foreground">/ {creditsIncluded.toLocaleString()}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {hasOrgCol('ai') && (
                          <TableCell className="text-right">
                            {aiIncluded > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <span>{formatNumber(aiUsed)}</span>
                                <span className="text-xs text-muted-foreground">/ {formatNumber(aiIncluded)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {hasOrgCol('api') && <TableCell className="text-right font-medium">{formatNumber(Number(org.api_requests_7d))}</TableCell>}
                      </TableRow>
                    );
                  })}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={orgUsageCols.length || 1} className="text-center text-muted-foreground">No organization data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="overflow-x-auto scrollbar-none w-full sm:w-auto -mx-1 px-1">
          <div className="flex items-center gap-2 w-max sm:flex-wrap sm:w-auto">
            <Button
              variant={subTab === 'analytics' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('analytics')}
              data-testid="btn-subtab-analytics"
              className="whitespace-nowrap"
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Reports
            </Button>
            <Button
              variant={subTab === 'overview' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('overview')}
              data-testid="btn-subtab-overview"
              className="whitespace-nowrap"
            >
              <Activity className="h-4 w-4 mr-1" />
              Overview
            </Button>
            <Button
              variant={subTab === 'users' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('users')}
              data-testid="btn-subtab-users"
              className="whitespace-nowrap"
            >
              <Users className="h-4 w-4 mr-1" />
              Users
            </Button>
            <Button
              variant={subTab === 'features' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('features')}
              data-testid="btn-subtab-features"
              className="whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Features
            </Button>
            <Button
              variant={subTab === 'performance' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('performance')}
              data-testid="btn-subtab-performance"
              className="whitespace-nowrap"
            >
              <Zap className="h-4 w-4 mr-1" />
              Perf
            </Button>
            <Button
              variant={subTab === 'database' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('database')}
              data-testid="btn-subtab-database"
              className="whitespace-nowrap"
            >
              <Database className="h-4 w-4 mr-1" />
              DB
            </Button>
            <Button
              variant={subTab === 'organizations' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('organizations')}
              data-testid="btn-subtab-organizations"
              className="whitespace-nowrap"
            >
              <Building2 className="h-4 w-4 mr-1" />
              Orgs
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="btn-refresh-monitoring" className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {subTab === 'overview' && renderOverview()}
      {subTab === 'users' && renderUserActivity()}
      {subTab === 'features' && renderFeatureUsage()}
      {subTab === 'performance' && renderPerformance()}
      {subTab === 'database' && renderDatabase()}
      {subTab === 'organizations' && renderOrgUsage()}
      {subTab === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

