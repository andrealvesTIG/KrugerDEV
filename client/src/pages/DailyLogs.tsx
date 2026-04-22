import { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useDailyLogs, useDailyLogSummary, useCreateDailyLog } from "@/hooks/use-daily-logs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Calendar, Users, Wrench, FileText, CloudSun, Eye } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { Link } from "wouter";

export default function DailyLogs() {
  const { currentOrganization } = useOrganization();
  const { data: projects = [], isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });

  const { data: logs = [], isLoading: logsLoading } = useDailyLogs(
    selectedProjectId || 0,
    dateRange.from,
    dateRange.to
  );
  const { data: summary } = useDailyLogSummary(
    selectedProjectId || 0,
    dateRange.from,
    dateRange.to
  );

  const activeProjects = projects.filter(p => !p.deletedAt && p.status !== "Closed");

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily Logs</h1>
          <p className="text-muted-foreground">Track daily site activity across your projects</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-64">
          <Select
            value={selectedProjectId?.toString() || ""}
            onValueChange={(v) => setSelectedProjectId(v ? Number(v) : null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {activeProjects.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateRange.from || ""}
            onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value || undefined }))}
            className="w-36 h-9"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={dateRange.to || ""}
            onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value || undefined }))}
            className="w-36 h-9"
          />
        </div>
        {selectedProjectId && (
          <Link href={`/projects/${selectedProjectId}?tab=daily-logs`}>
            <Button size="sm" variant="outline">
              <Eye className="h-4 w-4 mr-1" />
              Open in Project
            </Button>
          </Link>
        )}
      </div>

      {!selectedProjectId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a Project</h3>
            <p className="text-muted-foreground">Choose a project above to view and manage its daily logs</p>
          </CardContent>
        </Card>
      ) : logsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <SummaryCard icon={<Calendar className="h-4 w-4" />} label="Log Days" value={summary.totalDays} />
              <SummaryCard icon={<Users className="h-4 w-4" />} label="Total Headcount" value={summary.totalLaborHeadcount} />
              <SummaryCard icon={<Users className="h-4 w-4" />} label="Labor Hours" value={summary.totalLaborHours.toFixed(1)} />
              <SummaryCard icon={<Wrench className="h-4 w-4" />} label="Equipment Units" value={summary.totalEquipmentCount} />
              <SummaryCard icon={<Wrench className="h-4 w-4" />} label="Equipment Hours" value={summary.totalEquipmentHours.toFixed(1)} />
            </div>
          )}

          {logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No daily logs found for this date range</p>
                <Link href={`/projects/${selectedProjectId}?tab=daily-logs`}>
                  <Button className="mt-4" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Create Daily Log
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Link key={log.id} href={`/projects/${selectedProjectId}?tab=daily-logs`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center w-16 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(log.logDate), "EEE")}
                          </span>
                          <span className="text-xl font-bold">
                            {format(parseISO(log.logDate), "dd")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(log.logDate), "MMM yyyy")}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {log.weatherCondition && (
                              <Badge variant="outline" className="text-xs">
                                <CloudSun className="h-3 w-3 mr-1" />
                                {log.weatherCondition}
                                {log.temperature && ` · ${log.temperature}`}
                              </Badge>
                            )}
                          </div>
                          {log.notes && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{log.notes}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
