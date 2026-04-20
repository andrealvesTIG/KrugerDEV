import { useState, useMemo, useEffect } from "react";
  import { useQuery } from "@tanstack/react-query";
  import { apiRequest } from "@/lib/queryClient";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Loader2, TrendingUp, TrendingDown, Users, Building2, Activity, BarChart3, Calendar, ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Search, X, ArrowUp, ArrowDown, CheckCircle, Globe, Zap, Clock, CreditCard, UserPlus, LineChart } from "lucide-react";
  import { Input } from "@/components/ui/input";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import { normalizeSearch } from "@/lib/utils";
  import { format, subDays, subMonths } from "date-fns";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
  import { useToast } from "@/hooks/use-toast";

  // ===== ANALYTICS TAB =====

interface AnalyticsDashboard {
  userMetrics: {
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    activeUsers24h: number;
    activeUsers7d: number;
    activeUsers30d: number;
    avgSessionsPerUser: string;
    retentionRate: string;
  };
  organizationMetrics: {
    totalOrganizations: number;
    newOrgsThisMonth: number;
  };
  subscriptionMetrics: {
    byPlan: Array<{ plan_name: string; plan_code: string; subscription_count: number }>;
    churnedThisMonth: number;
  };
  charts: {
    dailySignups: Array<{ date: string; count: number }>;
    weeklySignups: Array<{ week_start: string; count: number }>;
    monthlySignups: Array<{ month_start: string; count: number }>;
    dailyPageViews: Array<{ date: string; views: number }>;
  };
  publicPageStats: Array<{ page_name: string; views: number; unique_visitors: number }>;
  featureUsage: Array<{ feature: string; usage_count: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; request_count: number; last_activity: string }>;
}

type UserFilter = 'total' | 'today' | 'week' | 'month' | null;

interface AnalyticsUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  emailVerified: boolean;
  role: string;
  profileImageUrl: string | null;
  deactivatedAt: string | null;
  signupSource: string | null;
}

export function AnalyticsTab() {
  const { toast } = useToast();
  const [chartView, setChartView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [userFilter, setUserFilter] = useState<UserFilter>(null);
  const [userSearch, setUserSearch] = useState('');
  type SortKey = 'name' | 'email' | 'insights' | 'role' | 'source' | 'verified' | 'signedUp' | 'profile';
  type ColumnKey = SortKey;
  const DEFAULT_COLUMN_ORDER: ColumnKey[] = ['name', 'email', 'insights', 'role', 'source', 'verified', 'signedUp', 'profile'];
  const COLUMN_ORDER_STORAGE_KEY = 'analytics-tab-user-columns-v1';
  const [sortColumn, setSortColumn] = useState<SortKey>('signedUp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLUMN_ORDER;
    try {
      const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      if (!raw) return DEFAULT_COLUMN_ORDER;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_COLUMN_ORDER;
      const valid = parsed.filter((k): k is ColumnKey => typeof k === 'string' && (DEFAULT_COLUMN_ORDER as string[]).includes(k));
      const missing = DEFAULT_COLUMN_ORDER.filter(k => !valid.includes(k));
      return [...valid, ...missing];
    } catch {
      return DEFAULT_COLUMN_ORDER;
    }
  });
  const [draggingColumn, setDraggingColumn] = useState<ColumnKey | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      /* ignore */
    }
  }, [columnOrder]);

  const moveColumn = (from: ColumnKey, to: ColumnKey) => {
    if (from === to) return;
    setColumnOrder(prev => {
      const next = prev.filter(k => k !== from);
      const idx = next.indexOf(to);
      if (idx === -1) return prev;
      next.splice(idx, 0, from);
      return next;
    });
  };

  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsDashboard>({
    queryKey: ['/api/admin/analytics/dashboard'],
    staleTime: 0,
  });

  const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery<AnalyticsUser[]>({
    queryKey: ['/api/users'],
  });

  const handleRefresh = () => {
    refetch();
    toast({ title: "Analytics refreshed" });
  };

  const toggleFilter = (filter: UserFilter) => {
    setUserFilter(prev => prev === filter ? null : filter);
  };

  const handleSort = (column: SortKey) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'signedUp' ? 'desc' : 'asc');
    }
  };

  const filteredUsers = useMemo(() => {
    if (allUsers.length === 0) return [];
    let filtered = [...allUsers];

    const toNYDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const todayNY = toNYDate(new Date());

    const subtractDays = (dateStr: string, days: number) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d - days);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };

    if (userFilter === 'today') {
      filtered = filtered.filter(u => toNYDate(new Date(u.createdAt)) === todayNY);
    } else if (userFilter === 'week') {
      const cutoff = subtractDays(todayNY, 7);
      filtered = filtered.filter(u => toNYDate(new Date(u.createdAt)) >= cutoff);
    } else if (userFilter === 'month') {
      const cutoff = subtractDays(todayNY, 30);
      filtered = filtered.filter(u => toNYDate(new Date(u.createdAt)) >= cutoff);
    }

    if (userSearch.trim()) {
      const q = normalizeSearch(userSearch);
      filtered = filtered.filter(u =>
        normalizeSearch([u.firstName, u.lastName].filter(Boolean).join(' ')).includes(q) ||
        normalizeSearch(u.email).includes(q) ||
        normalizeSearch(u.role).includes(q) ||
        normalizeSearch(u.signupSource || '').includes(q)
      );
    }

    const dir = sortDirection === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortColumn) {
        case 'name': {
          const nameA = [a.firstName, a.lastName].filter(Boolean).join(' ').toLowerCase();
          const nameB = [b.firstName, b.lastName].filter(Boolean).join(' ').toLowerCase();
          return nameA.localeCompare(nameB) * dir;
        }
        case 'email':
          return a.email.toLowerCase().localeCompare(b.email.toLowerCase()) * dir;
        case 'role':
          return a.role.localeCompare(b.role) * dir;
        case 'source': {
          const srcA = a.signupSource || '';
          const srcB = b.signupSource || '';
          return srcA.localeCompare(srcB) * dir;
        }
        case 'verified': {
          const vA = a.emailVerified ? 1 : 0;
          const vB = b.emailVerified ? 1 : 0;
          return (vA - vB) * dir;
        }
        case 'signedUp':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        case 'insights':
        case 'profile':
          return a.id.localeCompare(b.id) * dir;
        default:
          return 0;
      }
    });
    return filtered;
  }, [userFilter, allUsers, sortColumn, sortDirection, userSearch]);

  const filterLabel = userFilter === 'total' ? 'All Users' : userFilter === 'today' ? 'New Users Today' : userFilter === 'week' ? 'New Users This Week' : userFilter === 'month' ? 'New Users This Month' : 'All Users';

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatWeek = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatMonth = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No analytics data available yet.
      </div>
    );
  }

  const getSignupChartData = () => {
    if (chartView === 'weekly') {
      return analytics.charts.weeklySignups.map(item => ({
        label: formatWeek(item.week_start),
        value: Number(item.count)
      }));
    } else if (chartView === 'monthly') {
      return analytics.charts.monthlySignups.map(item => ({
        label: formatMonth(item.month_start),
        value: Number(item.count)
      }));
    }
    return analytics.charts.dailySignups.map(item => ({
      label: formatDate(item.date),
      value: Number(item.count)
    }));
  };

  const maxSignupValue = Math.max(...getSignupChartData().map(d => d.value), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
        <p className="text-muted-foreground">Comprehensive user and application statistics</p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card
          className={`hover-elevate cursor-pointer transition-all ${userFilter === 'total' ? 'ring-2 ring-primary shadow-md' : ''}`}
          data-testid="card-total-users"
          onClick={() => toggleFilter('total')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Total Users</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    Total number of registered users
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold mt-1">{formatNumber(analytics.userMetrics.totalUsers)}</div>
          </CardContent>
        </Card>

        <Card
          className={`hover-elevate cursor-pointer transition-all ${userFilter === 'today' ? 'ring-2 ring-primary shadow-md' : ''}`}
          data-testid="card-new-users-today"
          onClick={() => toggleFilter('today')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <UserPlus className="h-4 w-4" />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">New Today</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    Users who signed up today (Eastern Time)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold mt-1 text-green-600">{analytics.userMetrics.newUsersToday}</div>
          </CardContent>
        </Card>

        <Card
          className={`hover-elevate cursor-pointer transition-all ${userFilter === 'week' ? 'ring-2 ring-primary shadow-md' : ''}`}
          data-testid="card-new-users-week"
          onClick={() => toggleFilter('week')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="h-4 w-4" />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">New This Week</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    Users who signed up in the last 7 days
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold mt-1">{analytics.userMetrics.newUsersThisWeek}</div>
          </CardContent>
        </Card>

        <Card
          className={`hover-elevate cursor-pointer transition-all ${userFilter === 'month' ? 'ring-2 ring-primary shadow-md' : ''}`}
          data-testid="card-new-users-month"
          onClick={() => toggleFilter('month')}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <BarChart3 className="h-4 w-4" />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">New This Month</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    Users who signed up in the last 30 days
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold mt-1">{analytics.userMetrics.newUsersThisMonth}</div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-retention">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Activity className="h-4 w-4" />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">7-Day Retention</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    Percentage of users (signed up 7–37 days ago) who made at least one API request within their first week
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold mt-1">{analytics.userMetrics.retentionRate}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-5 w-5" />
            {filterLabel} ({filteredUsers.length})
          </CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9 w-full sm:w-[250px] h-9"
              />
            </div>
            {userFilter && (
              <Button variant="ghost" size="sm" onClick={() => setUserFilter(null)}>
                <X className="h-4 w-4 mr-1" />
                Clear Filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {(() => {
                const sourceLabels: Record<string, string> = {
                  'signin': 'Sign In',
                  'signup': 'Signup Page',
                  'auth-page': 'Auth Page',
                  'uncon2026': 'UnCon 2026',
                  'construction': 'Construction',
                  'healthcare': 'Healthcare',
                  'energy': 'Energy',
                  'government': 'Government',
                  'financial-services': 'Financial Services',
                  'manufacturing': 'Manufacturing',
                  'industrial-automation': 'Industrial Automation',
                  'google': 'Google',
                  'microsoft': 'Microsoft',
                  'resource-invite': 'Resource Invite',
                };
                const sourceLinks: Record<string, string> = {
                  'uncon2026': '/uncon2026',
                  'construction': '/construction',
                  'healthcare': '/healthcare',
                  'energy': '/energy',
                  'government': '/government',
                  'financial-services': '/financial-services',
                  'manufacturing': '/manufacturing',
                  'industrial-automation': '/industrial-automation',
                  'signin': '/signin',
                  'signup': '/signup',
                  'auth-page': '/auth',
                };
                const COLUMN_LABELS: Record<ColumnKey, string> = {
                  name: 'Name',
                  email: 'Email',
                  insights: 'Insights',
                  role: 'Role',
                  source: 'Source',
                  verified: 'Verified',
                  signedUp: 'Signed Up',
                  profile: 'Profile',
                };
                const renderCell = (key: ColumnKey, user: AnalyticsUser) => {
                  switch (key) {
                    case 'name':
                      return (
                        <TableCell key={key} className="font-medium">
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}
                        </TableCell>
                      );
                    case 'email':
                      return <TableCell key={key} className="text-muted-foreground">{user.email}</TableCell>;
                    case 'insights':
                      return (
                        <TableCell key={key}>
                          <a
                            href={`/admin/users/${user.id}/insights`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            data-testid={`link-user-insights-${user.id}`}
                          >
                            <LineChart className="h-3 w-3" />
                            View
                          </a>
                        </TableCell>
                      );
                    case 'role':
                      return (
                        <TableCell key={key}>
                          <Badge variant={user.role === 'super_admin' ? 'default' : 'outline'} className="text-xs">
                            {user.role}
                          </Badge>
                        </TableCell>
                      );
                    case 'source': {
                      if (!user.signupSource) {
                        return <TableCell key={key}><span className="text-muted-foreground text-xs">-</span></TableCell>;
                      }
                      const label = sourceLabels[user.signupSource] || user.signupSource;
                      const link = sourceLinks[user.signupSource];
                      return (
                        <TableCell key={key}>
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors">
                                {label}
                              </Badge>
                            </a>
                          ) : (
                            <Badge variant="outline" className="text-xs">{label}</Badge>
                          )}
                        </TableCell>
                      );
                    }
                    case 'verified':
                      return (
                        <TableCell key={key}>
                          {user.emailVerified ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">No</Badge>
                          )}
                        </TableCell>
                      );
                    case 'signedUp':
                      return (
                        <TableCell key={key} className="text-muted-foreground text-sm">
                          {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy h:mm a') : '-'}
                        </TableCell>
                      );
                    case 'profile':
                      return (
                        <TableCell key={key}>
                          <a
                            href={`https://fridayreport.ai/badges/${user.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Globe className="h-3 w-3" />
                            View
                          </a>
                        </TableCell>
                      );
                  }
                };
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columnOrder.map((key) => (
                          <TableHead
                            key={key}
                            draggable
                            onDragStart={() => setDraggingColumn(key)}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggingColumn) moveColumn(draggingColumn, key);
                              setDraggingColumn(null);
                            }}
                            onDragEnd={() => setDraggingColumn(null)}
                            className={`cursor-grab active:cursor-grabbing select-none hover:bg-muted/50 transition-colors ${draggingColumn === key ? 'opacity-50' : ''}`}
                            onClick={() => handleSort(key)}
                            data-testid={`th-column-${key}`}
                            title="Click to sort • Drag to reorder"
                          >
                            <div className="flex items-center gap-1">
                              {COLUMN_LABELS[key]}
                              {sortColumn === key ? (
                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-30" />
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          {columnOrder.map((key) => renderCell(key, user))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Users */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-active-24h">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Active Users (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(analytics.userMetrics.activeUsers24h)}</div>
            <p className="text-sm text-muted-foreground">Users with activity in last 24 hours</p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-7d">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              Active Users (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(analytics.userMetrics.activeUsers7d)}</div>
            <p className="text-sm text-muted-foreground">Users with activity in last 7 days</p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-30d">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              Active Users (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(analytics.userMetrics.activeUsers30d)}</div>
            <p className="text-sm text-muted-foreground">Users with activity in last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* User Signups Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              User Signups
            </CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={chartView === 'daily' ? 'default' : 'outline'}
                onClick={() => setChartView('daily')}
                data-testid="button-chart-daily"
              >
                Daily
              </Button>
              <Button
                size="sm"
                variant={chartView === 'weekly' ? 'default' : 'outline'}
                onClick={() => setChartView('weekly')}
                data-testid="button-chart-weekly"
              >
                Weekly
              </Button>
              <Button
                size="sm"
                variant={chartView === 'monthly' ? 'default' : 'outline'}
                onClick={() => setChartView('monthly')}
                data-testid="button-chart-monthly"
              >
                Monthly
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {getSignupChartData().map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors"
                  style={{ height: `${(item.value / maxSignupValue) * 100}%`, minHeight: item.value > 0 ? '4px' : '0' }}
                  title={`${item.label}: ${item.value} signups`}
                />
                <span className="text-[10px] text-muted-foreground rotate-[-45deg] origin-top-left whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Organization & Subscription Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Organizations</span>
              <span className="text-xl font-bold">{analytics.organizationMetrics.totalOrganizations}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">New This Month</span>
              <span className="text-xl font-bold text-green-600">+{analytics.organizationMetrics.newOrgsThisMonth}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.subscriptionMetrics.byPlan.map((plan, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <Badge variant="outline">{plan.plan_name}</Badge>
                  <span className="font-medium">{plan.subscription_count} active</span>
                </div>
              ))}
              {analytics.subscriptionMetrics.churnedThisMonth > 0 && (
                <div className="flex justify-between items-center pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Churned This Month</span>
                  <span className="text-red-600 font-medium">{analytics.subscriptionMetrics.churnedThisMonth}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Public Page Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Public Page Statistics (Last 30 Days)
          </CardTitle>
          <CardDescription>Page views and unique visitors for public pages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Unique Visitors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.publicPageStats.length > 0 ? (
                analytics.publicPageStats.map((page, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{page.page_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(page.views))}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(page.unique_visitors))}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    No public page data available yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Feature Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Feature Usage (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.featureUsage.filter(f => f.feature !== 'Other').map((feature, idx) => {
              const maxUsage = Math.max(...analytics.featureUsage.map(f => Number(f.usage_count)), 1);
              const percentage = (Number(feature.usage_count) / maxUsage) * 100;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{feature.feature}</span>
                    <span className="text-muted-foreground">{formatNumber(Number(feature.usage_count))} requests</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Active Users (Last 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.topUsers.map((user, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">
                    {user.first_name} {user.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-right">{formatNumber(Number(user.request_count))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.last_activity ? format(new Date(user.last_activity), 'MMM d, h:mm a') : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {analytics.topUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    No user activity data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

