import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Bell, BellOff, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTimesheetReminderSettings, useUpdateTimesheetReminderSettings, useSendRemindersNow } from "@/hooks/use-timesheets";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const SUBMISSION_DAY_OPTIONS = [
  { value: 4, label: "Thursday (pre-reminder)" },
  { value: 5, label: "Friday (due day)" },
  { value: 8, label: "Monday (overdue)" },
];

const DIGEST_DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

const TIME_SLOT_OPTIONS = (() => {
  const slots: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const minuteStr = m.toString().padStart(2, "0");
      slots.push({
        value: `${h}:${m}`,
        label: `${hour12}:${minuteStr} ${ampm}`,
      });
    }
  }
  return slots;
})();

export function ReminderSettingsSection({ organizationId }: { organizationId: number }) {
  const { data: settings, isLoading } = useTimesheetReminderSettings(organizationId);
  const updateSettings = useUpdateTimesheetReminderSettings();
  const sendNow = useSendRemindersNow();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [submissionDays, setSubmissionDays] = useState<number[]>([4, 5, 8]);
  const [approvalDays, setApprovalDays] = useState("2");
  const [escalationDays, setEscalationDays] = useState("5");
  const [frequencyCap, setFrequencyCap] = useState("3");
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestDay, setDigestDay] = useState("1");
  const [scheduledTime, setScheduledTime] = useState("9:0");
  const [showSendNowConfirm, setShowSendNowConfirm] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled ?? true);
      setEmailEnabled(settings.emailEnabled ?? true);
      setNotificationEnabled(settings.notificationEnabled ?? true);
      setSubmissionDays(settings.submissionReminderDays ?? [4, 5, 8]);
      setApprovalDays(String(settings.approvalReminderDays ?? 2));
      setEscalationDays(String(settings.escalationThresholdDays ?? 5));
      setFrequencyCap(String(settings.frequencyCap ?? 3));
      setDigestEnabled(settings.digestEnabled ?? true);
      setDigestDay(String(settings.digestDay ?? 1));
      setScheduledTime(`${settings.scheduledHour ?? 9}:${settings.scheduledMinute ?? 0}`);
    }
  }, [settings]);

  const toggleDay = (day: number) => {
    setSubmissionDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const parseScheduledTime = () => {
    const [h, m] = scheduledTime.split(":").map(Number);
    return { scheduledHour: h, scheduledMinute: m };
  };

  const handleSave = async () => {
    try {
      const { scheduledHour, scheduledMinute } = parseScheduledTime();
      await updateSettings.mutateAsync({
        organizationId,
        enabled,
        emailEnabled,
        notificationEnabled,
        submissionReminderDays: submissionDays,
        approvalReminderDays: parseInt(approvalDays) || 2,
        escalationThresholdDays: parseInt(escalationDays) || 5,
        frequencyCap: parseInt(frequencyCap) || 3,
        digestEnabled,
        digestDay: parseInt(digestDay) || 1,
        scheduledHour,
        scheduledMinute,
      });
      toast({ title: "Saved", description: "Reminder settings updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    }
  };

  const handleSendNow = async () => {
    try {
      await sendNow.mutateAsync({ organizationId });
      toast({ title: "Sent", description: "Reminders dispatched." });
      setShowSendNowConfirm(false);
    } catch {
      toast({ title: "Error", description: "Failed to send reminders.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
              Timesheet Reminders & Escalation
            </CardTitle>
            <CardDescription>
              Configure automated reminders for timesheet submission, approval, and escalation policies.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSendNowConfirm(true)} disabled={!enabled}>
              <Zap className="h-4 w-4 mr-1" /> Send Now
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">Enable Reminders</Label>
              <p className="text-xs text-muted-foreground">Master toggle for all automated timesheet reminders.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Send reminders via email.</p>
                  </div>
                  <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>In-App Notifications</Label>
                    <p className="text-xs text-muted-foreground">Show reminders in the notification bell.</p>
                  </div>
                  <Switch checked={notificationEnabled} onCheckedChange={setNotificationEnabled} />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-medium">Submission Reminder Days</Label>
                <p className="text-xs text-muted-foreground">Select which days of the week reminders are sent for un-submitted timesheets.</p>
                <div className="flex flex-wrap gap-3">
                  {SUBMISSION_DAY_OPTIONS.map(opt => (
                    <div key={opt.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`day-${opt.value}`}
                        checked={submissionDays.includes(opt.value)}
                        onCheckedChange={() => toggleDay(opt.value)}
                      />
                      <Label htmlFor={`day-${opt.value}`} className="text-sm cursor-pointer">{opt.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Approval Reminder (days)</Label>
                  <p className="text-xs text-muted-foreground">Remind managers after N days without approving.</p>
                  <Input type="number" min={1} max={14} value={approvalDays} onChange={(e) => setApprovalDays(e.target.value)} className="w-24" />
                </div>
                <div className="space-y-2">
                  <Label>Escalation Threshold (days)</Label>
                  <p className="text-xs text-muted-foreground">Escalate to org admin after N days without approval.</p>
                  <Input type="number" min={1} max={30} value={escalationDays} onChange={(e) => setEscalationDays(e.target.value)} className="w-24" />
                </div>
                <div className="space-y-2">
                  <Label>Max Reminders per Period</Label>
                  <p className="text-xs text-muted-foreground">Limit how many reminders are sent per period.</p>
                  <Input type="number" min={1} max={10} value={frequencyCap} onChange={(e) => setFrequencyCap(e.target.value)} className="w-24" />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>Manager Digest</Label>
                    <p className="text-xs text-muted-foreground">Weekly summary of pending approvals.</p>
                  </div>
                  <Switch checked={digestEnabled} onCheckedChange={setDigestEnabled} />
                </div>
                {digestEnabled && (
                  <div className="space-y-2">
                    <Label>Digest Day</Label>
                    <Select value={digestDay} onValueChange={setDigestDay}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIGEST_DAY_OPTIONS.map(d => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Scheduled Time</Label>
                <p className="text-xs text-muted-foreground">Time of day reminders are dispatched (server time).</p>
                <Select value={scheduledTime} onValueChange={setScheduledTime}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOT_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showSendNowConfirm} onOpenChange={setShowSendNowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Reminders Now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately dispatch submission and approval reminders to all applicable users. This does not affect the regular schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendNow}>
              <Zap className="mr-2 h-4 w-4" />
              Send Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
