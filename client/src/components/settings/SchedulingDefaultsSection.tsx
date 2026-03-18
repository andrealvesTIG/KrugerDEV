import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { SchedulingDefaults } from "@shared/schema";
import { DEFAULT_SCHEDULING_DEFAULTS } from "@shared/schema";

const DEPENDENCY_TYPE_OPTIONS = [
  { value: "finish-to-start", label: "FS", description: "Finish-to-Start" },
  { value: "start-to-start", label: "SS", description: "Start-to-Start" },
  { value: "finish-to-finish", label: "FF", description: "Finish-to-Finish" },
  { value: "start-to-finish", label: "SF", description: "Start-to-Finish" },
] as const;

export function SchedulingDefaultsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<SchedulingDefaults>(DEFAULT_SCHEDULING_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading } = useQuery<SchedulingDefaults>({
    queryKey: ['/api/organizations', organizationId, 'scheduling-defaults'],
  });

  useEffect(() => {
    if (data) {
      setConfig({ ...DEFAULT_SCHEDULING_DEFAULTS, ...data });
    }
  }, [data]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/scheduling-defaults`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'scheduling-defaults'] });
      toast({ title: "Saved", description: "Scheduling defaults updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save scheduling defaults", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Scheduling Defaults
        </CardTitle>
        <CardDescription>
          Set organization-wide defaults for task dependencies. These apply when creating new dependencies across all projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Default Dependency Type</Label>
          <p className="text-xs text-muted-foreground">
            The link type pre-selected when adding a new dependency
          </p>
          <Select
            value={config.defaultDependencyType}
            onValueChange={(val: SchedulingDefaults['defaultDependencyType']) =>
              setConfig(prev => ({ ...prev, defaultDependencyType: val }))
            }
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPENDENCY_TYPE_OPTIONS.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground ml-2">{t.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Default Lag (days)</Label>
          <p className="text-xs text-muted-foreground">
            The number of lag days pre-filled when adding a new dependency. Use negative values for lead time.
          </p>
          <Input
            type="number"
            className="w-[120px]"
            value={config.defaultLagDays}
            onChange={(e) => setConfig(prev => ({ ...prev, defaultLagDays: parseInt(e.target.value) || 0 }))}
            min={-30}
            max={90}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label>Enforce Defaults</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the default type and lag are locked and users cannot change them when creating dependencies.
              Existing dependencies can still be edited individually.
            </p>
          </div>
          <Switch
            checked={config.enforceDefaults}
            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enforceDefaults: checked }))}
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Scheduling Defaults
        </Button>
      </CardContent>
    </Card>
  );
}
