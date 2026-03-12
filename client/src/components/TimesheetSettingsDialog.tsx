import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTimesheetSettings, useUpdateTimesheetSettings } from "@/hooks/use-timesheets";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2 } from "lucide-react";

interface TimesheetSettingsDialogProps {
  organizationId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TimesheetSettingsDialog({ organizationId, open, onOpenChange }: TimesheetSettingsDialogProps) {
  const { data: settings, isLoading } = useTimesheetSettings(organizationId);
  const updateSettings = useUpdateTimesheetSettings();
  const { toast } = useToast();

  const [minWeeklyHours, setMinWeeklyHours] = useState("0");
  const [maxWeeklyHours, setMaxWeeklyHours] = useState("50");
  const [overtimeThreshold, setOvertimeThreshold] = useState("40");
  const [gracePeriodDays, setGracePeriodDays] = useState("0");
  const [mandatoryNotes, setMandatoryNotes] = useState(true);

  useEffect(() => {
    if (settings) {
      setMinWeeklyHours(String(settings.minWeeklyHours || "0"));
      setMaxWeeklyHours(String(settings.maxWeeklyHours || "50"));
      setOvertimeThreshold(String(settings.overtimeThreshold || "40"));
      setGracePeriodDays(String(settings.gracePeriodDays || "0"));
      setMandatoryNotes(settings.mandatoryNotes ?? true);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!organizationId) return;

    try {
      await updateSettings.mutateAsync({
        organizationId,
        minWeeklyHours: parseFloat(minWeeklyHours) || 0,
        maxWeeklyHours: parseFloat(maxWeeklyHours) || 50,
        overtimeThreshold: parseFloat(overtimeThreshold) || 40,
        gracePeriodDays: parseInt(gracePeriodDays) || 0,
        mandatoryNotes,
      });
      toast({ title: "Settings saved", description: "Timesheet policies have been updated." });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Timesheet Policies
          </DialogTitle>
          <DialogDescription>
            Configure organization-level timesheet rules and controls.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minWeeklyHours">Min Weekly Hours</Label>
                <Input
                  id="minWeeklyHours"
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  value={minWeeklyHours}
                  onChange={(e) => setMinWeeklyHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxWeeklyHours">Max Weekly Hours</Label>
                <Input
                  id="maxWeeklyHours"
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  value={maxWeeklyHours}
                  onChange={(e) => setMaxWeeklyHours(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overtimeThreshold">Overtime Threshold (hrs/week)</Label>
                <Input
                  id="overtimeThreshold"
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  value={overtimeThreshold}
                  onChange={(e) => setOvertimeThreshold(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gracePeriodDays">Grace Period (days after close)</Label>
                <Input
                  id="gracePeriodDays"
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="mandatoryNotes" className="font-medium">Mandatory Notes</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Require notes on all timesheet entries
                </p>
              </div>
              <Switch
                id="mandatoryNotes"
                checked={mandatoryNotes}
                onCheckedChange={setMandatoryNotes}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Policies
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
