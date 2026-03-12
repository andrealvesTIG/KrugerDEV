import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { 
  useTeamReview,
  useSlaMetrics,
  useCurrentUserResource,
  type TeamReviewData,
  type ManagerSlaMetrics,
} from "@/hooks/use-timesheets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Timer, 
  TrendingUp, 
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs">Approved</Badge>;
    case "submitted":
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-xs">Submitted</Badge>;
    case "partial":
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-xs">Partial</Badge>;
    case "no_entries":
      return <Badge className="bg-gray-500/10 text-gray-500 border-gray-200 text-xs">No Entries</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">Mixed</Badge>;
  }
}

export function TeamReviewDashboard() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { data: currentResource } = useCurrentUserResource(currentOrganization?.id ?? null, user?.id);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "hours" | "status">("status");

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(weekEnd, "yyyy-MM-dd");

  const { data: teamData, isLoading } = useTeamReview(
    currentOrganization?.id ?? null,
    startDate,
    endDate
  );

  const { data: slaMetrics, isError: slaError } = useSlaMetrics(
    currentOrganization?.id ?? null,
    startDate,
    endDate
  );

  const filteredTeam = useMemo(() => {
    if (!teamData?.team) return [];
    let filtered = teamData.team.filter(member =>
      !searchQuery || member.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.department?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
      if (sortBy === "name") return a.displayName.localeCompare(b.displayName);
      if (sortBy === "hours") return b.totalHours - a.totalHours;
      const statusOrder: Record<string, number> = { submitted: 0, partial: 1, no_entries: 2, approved: 3, mixed: 4 };
      return (statusOrder[a.submissionStatus] ?? 5) - (statusOrder[b.submissionStatus] ?? 5);
    });
    return filtered;
  }, [teamData, searchQuery, sortBy]);

  const summaryStats = useMemo(() => {
    if (!teamData?.team) return { total: 0, submitted: 0, approved: 0, pending: 0, totalHours: 0 };
    const team = teamData.team;
    return {
      total: team.length,
      submitted: team.filter(m => m.submissionStatus === "submitted" || m.submissionStatus === "approved").length,
      approved: team.filter(m => m.submissionStatus === "approved").length,
      pending: team.filter(m => m.submitted > 0).reduce((sum, m) => sum + m.submitted, 0),
      totalHours: team.reduce((sum, m) => sum + m.totalHours, 0),
    };
  }, [teamData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <div className="font-semibold text-sm">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-48 h-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-32 h-9">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">By Status</SelectItem>
              <SelectItem value="name">By Name</SelectItem>
              <SelectItem value="hours">By Hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Users className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Team Members</span>
          </div>
          <div className="text-2xl font-bold">{summaryStats.total}</div>
          <div className="text-xs text-muted-foreground">{summaryStats.submitted} submitted</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <Clock className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Hours</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(summaryStats.totalHours)}</div>
          <div className="text-xs text-muted-foreground">{summaryStats.total > 0 ? Math.round(summaryStats.totalHours / summaryStats.total) : 0}h avg</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Pending Review</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{summaryStats.pending}</div>
          <div className="text-xs text-muted-foreground">entries awaiting</div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Timer className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Turnaround</span>
          </div>
          <div className="text-2xl font-bold">{slaMetrics?.avgTurnaroundDays ?? 0}d</div>
          <div className="text-xs text-muted-foreground">
            {slaMetrics?.exceedingSla ? (
              <span className="text-destructive">{slaMetrics.exceedingSla} over SLA</span>
            ) : (
              "within SLA"
            )}
          </div>
        </Card>
      </div>

      {teamData?.delegatedForUsers && teamData.delegatedForUsers.length > 0 && (
        <Card className="p-3 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <Users className="h-4 w-4" />
            <span>You are acting as a delegated approver for {teamData.delegatedForUsers.length} manager(s)</span>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team Members ({filteredTeam.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {filteredTeam.map((member) => {
                const compliance = Math.round((member.totalHours / 40) * 100);
                return (
                  <div
                    key={member.resourceId}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors flex-wrap sm:flex-nowrap"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      {member.photoUrl && <AvatarImage src={member.photoUrl} />}
                      <AvatarFallback className="text-xs">{getInitials(member.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{member.displayName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {member.department || member.title || member.email || "No info"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      <div className="text-right min-w-[60px]">
                        <div className="text-sm font-medium tabular-nums">{member.totalHours}h</div>
                        <div className="text-xs text-muted-foreground">{member.entryCount} entries</div>
                      </div>
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="w-16">
                          <Progress value={Math.min(100, compliance)} className="h-1.5" />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-8">{compliance}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {member.draft > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            {member.draft} draft
                          </Badge>
                        )}
                        {member.submitted > 0 && (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px] h-5 px-1.5">
                            {member.submitted} pending
                          </Badge>
                        )}
                        {member.approved > 0 && (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px] h-5 px-1.5">
                            {member.approved} approved
                          </Badge>
                        )}
                        {member.rejected > 0 && (
                          <Badge className="bg-red-500/10 text-red-600 border-red-200 text-[10px] h-5 px-1.5">
                            {member.rejected} rejected
                          </Badge>
                        )}
                      </div>
                      {getStatusBadge(member.submissionStatus)}
                    </div>
                  </div>
                );
              })}
              {filteredTeam.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No team members match your search" : "No team data available for this period"}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {slaMetrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Resolved Entries</div>
              <div className="text-xl font-bold text-emerald-600">{slaMetrics.resolvedCount}</div>
              <div className="text-xs text-muted-foreground">of {slaMetrics.totalSubmitted} submitted</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Exceeding SLA ({slaMetrics.slaThresholdDays}d)</div>
              <div className={`text-xl font-bold ${slaMetrics.exceedingSla > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {slaMetrics.exceedingSla + slaMetrics.pendingExceedingSla}
              </div>
              <div className="text-xs text-muted-foreground">
                {slaMetrics.exceedingSla} resolved + {slaMetrics.pendingExceedingSla} pending
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Avg Response Time</div>
              <div className={`text-xl font-bold ${slaMetrics.avgTurnaroundHours > 72 ? "text-amber-600" : "text-emerald-600"}`}>
                {slaMetrics.avgTurnaroundHours}h
              </div>
              <div className="text-xs text-muted-foreground">{slaMetrics.avgTurnaroundDays} days average</div>
            </Card>
          </div>

          {slaMetrics.byManager && slaMetrics.byManager.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">SLA by Manager</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Manager</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Submitted</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Resolved</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Avg Time</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">SLA Breaches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slaMetrics.byManager.map((m: ManagerSlaMetrics) => (
                        <tr key={m.managerId} className="border-b last:border-0">
                          <td className="py-2 font-medium">{m.managerName}</td>
                          <td className="py-2 text-center">{m.totalSubmitted}</td>
                          <td className="py-2 text-center">{m.resolvedCount}</td>
                          <td className="py-2 text-center">
                            <span className={m.avgTurnaroundHours > 72 ? "text-amber-600" : "text-emerald-600"}>
                              {m.avgTurnaroundDays}d
                            </span>
                          </td>
                          <td className="py-2 text-center">
                            <span className={m.exceedingSla + m.pendingExceedingSla > 0 ? "text-destructive font-medium" : "text-emerald-600"}>
                              {m.exceedingSla + m.pendingExceedingSla}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}