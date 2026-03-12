import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTimesheetCompliance } from "@/hooks/use-timesheets";
import { useProjects } from "@/hooks/use-projects";
import { useResources } from "@/hooks/use-resources";
import {
  Loader2,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Search,
  BarChart3,
  FolderOpen,
  UserCircle,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from "date-fns";

interface TimesheetComplianceDashboardProps {
  organizationId: number | null;
}

export function TimesheetComplianceDashboard({ organizationId }: TimesheetComplianceDashboardProps) {
  const [dateRange, setDateRange] = useState<"week" | "month" | "last-month">("week");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "overtime" | "no-entries">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");

  const { data: projects } = useProjects(organizationId);
  const { data: resources } = useResources(organizationId);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "week":
        return {
          startDate: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          endDate: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "month":
        return {
          startDate: format(startOfMonth(now), "yyyy-MM-dd"),
          endDate: format(endOfMonth(now), "yyyy-MM-dd"),
        };
      case "last-month": {
        const lastMonth = subMonths(now, 1);
        return {
          startDate: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
          endDate: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
        };
      }
    }
  }, [dateRange]);

  const complianceFilters = useMemo(() => ({
    projectId: projectFilter !== "all" ? Number(projectFilter) : undefined,
    resourceId: resourceFilter !== "all" ? Number(resourceFilter) : undefined,
  }), [projectFilter, resourceFilter]);

  const { data, isLoading } = useTimesheetCompliance(organizationId, startDate, endDate, complianceFilters);

  const filteredUsers = useMemo(() => {
    if (!data?.byUser) return [];
    let users = data.byUser;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      users = users.filter(u => u.resourceName.toLowerCase().includes(q));
    }

    if (statusFilter === "overtime") {
      users = users.filter(u => u.overtime);
    } else if (statusFilter === "no-entries") {
      users = users.filter(u => u.entries === 0);
    }

    return users;
  }, [data?.byUser, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No compliance data available
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Compliance Dashboard</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-44 h-9">
              <FolderOpen className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={resourceFilter} onValueChange={setResourceFilter}>
            <SelectTrigger className="w-44 h-9">
              <UserCircle className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All Team Members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team Members</SelectItem>
              {resources?.filter((r: any) => r.userId).map((r: any) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v: "week" | "month" | "last-month") => setDateRange(v)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Submission Rate</span>
            </div>
            <div className="text-2xl font-bold">{summary.submissionRate}%</div>
            <Progress value={summary.submissionRate} className="mt-2 h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              {summary.usersWithEntries}/{summary.totalResources} resources
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Approval Rate</span>
            </div>
            <div className="text-2xl font-bold">{summary.approvalRate}%</div>
            <Progress value={summary.approvalRate} className="mt-2 h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalApproved} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Rejection Rate</span>
            </div>
            <div className="text-2xl font-bold">{summary.rejectionRate}%</div>
            <Progress value={summary.rejectionRate} className="mt-2 h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalRejected} rejected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Overtime</span>
            </div>
            <div className="text-2xl font-bold">{summary.overtimeUsers}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Over {summary.overtimeThreshold}h threshold
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <Card className="col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground">Total Entries</div>
            <div className="text-xl font-bold">{summary.totalEntries}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" /> Pending
            </div>
            <div className="text-xl font-bold text-amber-600">{summary.totalSubmitted}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground">Draft</div>
            <div className="text-xl font-bold text-gray-500">{summary.totalDraft}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> No Entries
            </div>
            <div className="text-xl font-bold text-red-500">{summary.usersWithNoEntries}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3 text-orange-500" /> Late
            </div>
            <div className="text-xl font-bold text-orange-600">{summary.lateSubmissions}</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3 text-red-500" /> Overdue
            </div>
            <div className="text-xl font-bold text-red-600">{summary.overdueApprovals}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Resource Breakdown</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-48 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v: "all" | "overtime" | "no-entries") => setStatusFilter(v)}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="overtime">Overtime</SelectItem>
                  <SelectItem value="no-entries">No Entries</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Resource</th>
                  <th className="pb-2 font-medium text-center">Hours</th>
                  <th className="pb-2 font-medium text-center">Entries</th>
                  <th className="pb-2 font-medium text-center">Draft</th>
                  <th className="pb-2 font-medium text-center">Submitted</th>
                  <th className="pb-2 font-medium text-center">Approved</th>
                  <th className="pb-2 font-medium text-center">Rejected</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.userId} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 font-medium">{user.resourceName}</td>
                    <td className="py-2 text-center">
                      <span className={user.overtime ? "text-amber-600 font-semibold" : ""}>
                        {user.totalHours.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 text-center">{user.entries}</td>
                    <td className="py-2 text-center text-gray-500">{user.draft}</td>
                    <td className="py-2 text-center text-amber-600">{user.submitted}</td>
                    <td className="py-2 text-center text-green-600">{user.approved}</td>
                    <td className="py-2 text-center text-red-600">{user.rejected}</td>
                    <td className="py-2 text-center">
                      {user.entries === 0 ? (
                        <Badge variant="outline" className="text-red-600 border-red-300">No Entries</Badge>
                      ) : user.overtime ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">Overtime</Badge>
                      ) : user.draft > 0 ? (
                        <Badge variant="outline" className="text-gray-600">In Progress</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-300">On Track</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No resources match the current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
