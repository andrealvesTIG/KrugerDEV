import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, Bell, Lock, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ALL_EMAIL_MASTER_KEY,
  groupMasterFieldId,
  type NotificationChannel,
  type NotificationDefinition,
  type NotificationGroup,
  preferenceFieldId,
} from "@shared/notificationCatalog";
import { cn } from "@/lib/utils";

interface PreferencesResponse {
  catalog: NotificationDefinition[];
  groups: NotificationGroup[];
  preferences: Record<string, boolean>;
  resolved: Record<string, boolean>;
  allEmailMasterKey: string;
}

const QUERY_KEY = ["/api/profile/notification-preferences"];

export default function NotificationPreferences() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<PreferencesResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/profile/notification-preferences", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load notification preferences");
      return res.json();
    },
  });

  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data?.resolved) {
      setPending({});
    }
  }, [data?.resolved]);

  const merged = useMemo<Record<string, boolean>>(() => {
    if (!data) return {};
    const base = { ...data.preferences, ...pending };
    const next: Record<string, boolean> = {};
    const allEmailOff = base[`${ALL_EMAIL_MASTER_KEY}.email`] === false;
    next[`${ALL_EMAIL_MASTER_KEY}.email`] = !allEmailOff;
    for (const def of data.catalog) {
      for (const channel of def.channels) {
        const groupOff = base[groupMasterFieldId(def.groupId, channel)] === false;
        const rowField = preferenceFieldId(def.key, channel);
        let effective: boolean;
        if (def.required) {
          effective = true;
        } else if (channel === "email" && allEmailOff) {
          effective = false;
        } else if (groupOff) {
          effective = false;
        } else {
          const stored = base[rowField];
          effective = typeof stored === "boolean" ? stored : true;
        }
        next[rowField] = effective;
      }
    }
    for (const group of data.groups) {
      const channels = new Set<NotificationChannel>();
      for (const def of data.catalog) if (def.groupId === group.id) for (const c of def.channels) channels.add(c);
      for (const channel of channels) {
        const f = groupMasterFieldId(group.id, channel);
        next[f] = base[f] !== false;
      }
    }
    return next;
  }, [data, pending]);

  const globalSummary = useMemo(() => {
    if (!data) return { enabled: 0, total: 0 };
    let enabled = 0;
    let total = 0;
    for (const def of data.catalog) {
      for (const channel of def.channels) {
        total += 1;
        if (merged[preferenceFieldId(def.key, channel)] !== false) enabled += 1;
      }
    }
    return { enabled, total };
  }, [data, merged]);

  const saveMutation = useMutation({
    mutationFn: async (overrides: { preferences?: Record<string, boolean>; reset?: boolean }) => {
      const res = await apiRequest("PUT", "/api/profile/notification-preferences", overrides);
      return (await res.json()) as PreferencesResponse;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setPending({});
      toast({ title: "Notification preferences saved" });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save preferences",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="notif-prefs-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Couldn't load your notification settings.</p>
          <Button variant="outline" onClick={() => refetch()} data-testid="notif-prefs-retry">Try again</Button>
        </CardContent>
      </Card>
    );
  }

  const dirtyKeys = Object.keys(pending);
  const isDirty = dirtyKeys.length > 0;

  const handleToggle = (key: string, channel: NotificationChannel, def: NotificationDefinition | null, value: boolean) => {
    if (def?.required) return;
    const field = preferenceFieldId(key, channel);
    setPending((prev) => {
      const next = { ...prev };
      const baseline = data.resolved[field];
      if (value === baseline) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!isDirty) return;
    saveMutation.mutate({ preferences: pending });
  };

  const handleReset = () => {
    if (!window.confirm("Reset all notification preferences to defaults? Required notifications stay on.")) return;
    saveMutation.mutate({ reset: true });
  };

  const allEmailEnabled = merged[`${ALL_EMAIL_MASTER_KEY}.email`] !== false;

  const handleAllEmailToggle = (value: boolean) => {
    const field = `${ALL_EMAIL_MASTER_KEY}.email`;
    setPending((prev) => {
      const next = { ...prev };
      const baseline = data.resolved[field];
      if (value === baseline) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const handleGroupMasterToggle = (groupId: string, channel: NotificationChannel, value: boolean) => {
    const field = groupMasterFieldId(groupId, channel);
    setPending((prev) => {
      const next = { ...prev };
      const baseline = data.resolved[field];
      if (value === baseline) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const groups = data.groups;
  const grouped = new Map<string, NotificationDefinition[]>();
  for (const def of data.catalog) {
    const list = grouped.get(def.groupId) || [];
    list.push(def);
    grouped.set(def.groupId, list);
  }

  return (
    <div className="space-y-6">
      <Card data-testid="notif-prefs-master">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5" />
                All email notifications
              </CardTitle>
              <CardDescription>
                Master switch for every optional email. Required messages (sign-in, password reset, organization
                invites) are always delivered.
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0" data-testid="notif-prefs-global-summary">
              {globalSummary.enabled} of {globalSummary.total} channels on
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable email notifications</p>
              <p className="text-sm text-muted-foreground">
                Turn off to stop all non-essential email. You'll still receive in-app notifications.
              </p>
            </div>
            <Switch
              checked={allEmailEnabled}
              onCheckedChange={handleAllEmailToggle}
              data-testid="switch-all-email"
            />
          </div>
        </CardContent>
      </Card>

      {groups.map((group) => {
        const entries = grouped.get(group.id) || [];
        if (entries.length === 0) return null;
        const isCollapsed = !!collapsed[group.id];
        const summary = summarizeGroup(entries, merged);
        const groupChannels = collectGroupChannels(entries);
        const hasRequired = entries.some((e) => e.required);
        return (
          <Card key={group.id} data-testid={`notif-prefs-group-${group.id}`}>
            <CardHeader className="cursor-pointer" onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {group.label}
                  </CardTitle>
                  <CardDescription className="ml-6 mt-1">{group.description}</CardDescription>
                </div>
                <Badge variant="outline" className="shrink-0" data-testid={`notif-prefs-summary-${group.id}`}>
                  {summary.enabled} of {summary.total} on
                </Badge>
              </div>
            </CardHeader>
            {!isCollapsed && (
              <CardContent className="space-y-1 pt-0">
                <div
                  className="flex items-start justify-between gap-3 py-3 bg-muted/40 rounded-md px-3"
                  data-testid={`notif-group-master-${group.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">All {group.label.toLowerCase()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Master switch for this category. {hasRequired ? "Required messages stay on." : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {groupChannels.map((channel) => {
                      const field = groupMasterFieldId(group.id, channel);
                      const checked = merged[field] !== false;
                      const disabled = channel === "email" && !allEmailEnabled;
                      return (
                        <div key={channel} className="flex items-center gap-1.5" title={channel === "email" ? "Email" : "In-app"}>
                          {channel === "email" ? (
                            <Mail className={cn("h-3.5 w-3.5", checked && !disabled ? "text-primary" : "text-muted-foreground")} />
                          ) : (
                            <Bell className={cn("h-3.5 w-3.5", checked && !disabled ? "text-primary" : "text-muted-foreground")} />
                          )}
                          <Switch
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(v) => handleGroupMasterToggle(group.id, channel, v)}
                            data-testid={`switch-group-${group.id}-${channel}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                {entries.map((def, idx) => {
                  const groupEmailOff = merged[groupMasterFieldId(group.id, "email")] === false;
                  const groupInAppOff = merged[groupMasterFieldId(group.id, "inApp")] === false;
                  return (
                    <div key={def.key}>
                      {idx === 0 && <Separator className="my-2" />}
                      {idx > 0 && <Separator className="my-2" />}
                      <PreferenceRow
                        def={def}
                        merged={merged}
                        onToggle={(channel, value) => handleToggle(def.key, channel, def, value)}
                        allEmailDisabled={!allEmailEnabled && !def.required}
                        groupEmailDisabled={groupEmailOff && !def.required}
                        groupInAppDisabled={groupInAppOff && !def.required}
                      />
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between sticky bottom-4 bg-background/95 backdrop-blur p-4 border rounded-lg shadow-md">
        <div className="text-sm text-muted-foreground" data-testid="notif-prefs-dirty">
          {isDirty ? `${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"} pending` : "All changes saved"}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={saveMutation.isPending}
            data-testid="button-reset-notif-prefs"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to defaults
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            data-testid="button-save-notif-prefs"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save preferences
          </Button>
        </div>
      </div>
    </div>
  );
}

function collectGroupChannels(entries: NotificationDefinition[]): NotificationChannel[] {
  const set = new Set<NotificationChannel>();
  for (const e of entries) for (const c of e.channels) set.add(c);
  const order: NotificationChannel[] = ["email", "inApp"];
  return order.filter((c) => set.has(c));
}

function summarizeGroup(entries: NotificationDefinition[], merged: Record<string, boolean>) {
  let enabled = 0;
  let total = 0;
  for (const def of entries) {
    for (const channel of def.channels) {
      total += 1;
      const field = preferenceFieldId(def.key, channel);
      if (merged[field] !== false) enabled += 1;
    }
  }
  return { enabled, total };
}

function PreferenceRow({
  def,
  merged,
  onToggle,
  allEmailDisabled,
  groupEmailDisabled,
  groupInAppDisabled,
}: {
  def: NotificationDefinition;
  merged: Record<string, boolean>;
  onToggle: (channel: NotificationChannel, value: boolean) => void;
  allEmailDisabled: boolean;
  groupEmailDisabled: boolean;
  groupInAppDisabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3" data-testid={`notif-row-${def.key}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{def.label}</p>
          {def.required && (
            <Badge variant="secondary" className="gap-1 text-xs" data-testid={`notif-required-${def.key}`}>
              <Lock className="h-3 w-3" />
              Required
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {def.channels.map((channel) => {
          const field = preferenceFieldId(def.key, channel);
          const checked = merged[field] !== false;
          const groupOff = channel === "email" ? groupEmailDisabled : groupInAppDisabled;
          const disabled = !!def.required || (channel === "email" && allEmailDisabled) || groupOff;
          return (
            <div key={channel} className="flex items-center gap-1.5" title={channel === "email" ? "Email" : "In-app"}>
              {channel === "email" ? (
                <Mail className={cn("h-3.5 w-3.5", checked && !disabled ? "text-primary" : "text-muted-foreground")} />
              ) : (
                <Bell className={cn("h-3.5 w-3.5", checked && !disabled ? "text-primary" : "text-muted-foreground")} />
              )}
              <Switch
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => onToggle(channel, v)}
                data-testid={`switch-${def.key}-${channel}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
