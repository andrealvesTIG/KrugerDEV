import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, Calendar, Clock, Mail, Play, AlertTriangle, CheckCircle2, XCircle,
  SkipForward, Loader2, Users,
} from "lucide-react";

interface ProjectAgentConfig {
  id: number;
  projectId: number;
  enabled: boolean;
  agendaEnabled: boolean;
  agendaDay: number;
  agendaTime: string;
  taskFollowUpEnabled: boolean;
  taskFollowUpDay: number;
  taskFollowUpTime: string;
  statusReportEnabled: boolean;
  statusReportDay: number;
  statusReportTime: string;
  timezone: string;
  lastAgendaRun: string | null;
  nextAgendaRun: string | null;
  lastTaskFollowUpRun: string | null;
  nextTaskFollowUpRun: string | null;
  lastStatusReportRun: string | null;
  nextStatusReportRun: string | null;
}

interface AgentLog {
  id: number;
  actionType: string;
  subject: string;
  recipientEmails: string[];
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface StakeholderInfo {
  managerEmail: string | null;
  sponsorEmail: string | null;
  techLeadEmail: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMES = Array.from({ length: 24 }, (_, h) => {
  const hh = h.toString().padStart(2, "0");
  return [`${hh}:00`, `${hh}:30`];
}).flat();
const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
  "Australia/Sydney", "Pacific/Auckland",
];

export default function ProjectAgentTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [triggeringAction, setTriggeringAction] = useState<string | null>(null);

  const { data: agent, isLoading } = useQuery<ProjectAgentConfig | null>({
    queryKey: ["/api/projects", projectId, "agent"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/agent`).then(r => r.json()),
  });

  const { data: stakeholders } = useQuery<StakeholderInfo>({
    queryKey: ["/api/projects", projectId, "agent", "stakeholders"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/agent/stakeholders`).then(r => r.json()),
  });

  const { data: logs = [] } = useQuery<AgentLog[]>({
    queryKey: ["/api/projects", projectId, "agent", "logs"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/agent/logs`).then(r => r.json()),
  });

  const updateAgent = useMutation({
    mutationFn: (config: Partial<ProjectAgentConfig>) =>
      apiRequest("PUT", `/api/projects/${projectId}/agent`, config).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent"] });
      toast({ title: "Agent configuration updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update agent", variant: "destructive" });
    },
  });

  const triggerAction = useMutation({
    mutationFn: (action: string) =>
      apiRequest("POST", `/api/projects/${projectId}/agent/trigger/${action}`).then(r => r.json()),
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent", "logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent"] });
      toast({ title: `Action '${action}' executed successfully` });
      setTriggeringAction(null);
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
      setTriggeringAction(null);
    },
  });

  const config = agent || {
    enabled: false,
    agendaEnabled: true, agendaDay: 1, agendaTime: "09:00",
    taskFollowUpEnabled: true, taskFollowUpDay: 3, taskFollowUpTime: "09:00",
    statusReportEnabled: true, statusReportDay: 5, statusReportTime: "09:00",
    timezone: "America/New_York",
  };

  const handleUpdate = (updates: Partial<ProjectAgentConfig>) => {
    updateAgent.mutate({ ...config, ...updates });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const actionTypes = [
    { key: "agenda", label: "Meeting Agenda", enabledKey: "agendaEnabled", dayKey: "agendaDay", timeKey: "agendaTime", lastRun: agent?.lastAgendaRun, nextRun: agent?.nextAgendaRun, trigger: "meeting_agenda", icon: Calendar },
    { key: "taskFollowUp", label: "Task Follow-Up", enabledKey: "taskFollowUpEnabled", dayKey: "taskFollowUpDay", timeKey: "taskFollowUpTime", lastRun: agent?.lastTaskFollowUpRun, nextRun: agent?.nextTaskFollowUpRun, trigger: "task_follow_up", icon: Mail },
    { key: "statusReport", label: "Status Report", enabledKey: "statusReportEnabled", dayKey: "statusReportDay", timeKey: "statusReportTime", lastRun: agent?.lastStatusReportRun, nextRun: agent?.nextStatusReportRun, trigger: "status_report", icon: AlertTriangle },
  ] as const;

  return (
    <div className="space-y-6 p-1">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle>AI Project Agent</CardTitle>
                <CardDescription>Automated meeting agendas, task follow-ups, and status reports</CardDescription>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => handleUpdate({ enabled } as any)}
            />
          </div>
        </CardHeader>
      </Card>

      {config.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {actionTypes.map((action) => {
              const ActionIcon = action.icon;
              const isEnabled = (config as any)[action.enabledKey];
              const dayValue = (config as any)[action.dayKey];
              const timeValue = (config as any)[action.timeKey];
              return (
                <Card key={action.key} className={!isEnabled ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ActionIcon className="h-4 w-4" />
                        <CardTitle className="text-sm">{action.label}</CardTitle>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(v) => handleUpdate({ [action.enabledKey]: v } as any)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Day</Label>
                      <Select
                        value={String(dayValue)}
                        onValueChange={(v) => handleUpdate({ [action.dayKey]: Number(v) } as any)}
                        disabled={!isEnabled}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Time</Label>
                      <Select
                        value={timeValue}
                        onValueChange={(v) => handleUpdate({ [action.timeKey]: v } as any)}
                        disabled={!isEnabled}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {action.lastRun && (
                      <p className="text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Last: {new Date(action.lastRun).toLocaleDateString()}
                      </p>
                    )}
                    {action.nextRun && (
                      <p className="text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        Next: {new Date(action.nextRun).toLocaleDateString()} {new Date(action.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={triggeringAction !== null}
                      onClick={() => {
                        setTriggeringAction(action.trigger);
                        triggerAction.mutate(action.trigger);
                      }}
                    >
                      {triggeringAction === action.trigger ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                      Run Now
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Timezone</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={config.timezone}
                onValueChange={(tz) => handleUpdate({ timezone: tz } as any)}
              >
                <SelectTrigger className="h-8 text-sm w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {stakeholders && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <CardTitle className="text-sm">Stakeholders (Email Recipients)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Project Manager</Label>
                    <p>{stakeholders.managerEmail || <span className="text-muted-foreground italic">Not assigned</span>}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Business Sponsor</Label>
                    <p>{stakeholders.sponsorEmail || <span className="text-muted-foreground italic">Not assigned</span>}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Technical Lead</Label>
                    <p>{stakeholders.techLeadEmail || <span className="text-muted-foreground italic">Not assigned</span>}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Configure roles in the project Summary tab to set email recipients.
                </p>
              </CardContent>
            </Card>
          )}

          {logs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                        <div className="mt-0.5">
                          {log.status === "success" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                           log.status === "error" ? <XCircle className="h-4 w-4 text-red-500" /> :
                           <SkipForward className="h-4 w-4 text-amber-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">
                              {log.actionType.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm mt-1 truncate">{log.subject}</p>
                          {log.recipientEmails?.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              To: {log.recipientEmails.join(", ")}
                            </p>
                          )}
                          {log.errorMessage && (
                            <p className="text-xs text-red-500 mt-1">{log.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
