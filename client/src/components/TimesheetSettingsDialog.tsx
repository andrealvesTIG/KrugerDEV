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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useTimesheetSettings,
  useUpdateTimesheetSettings,
  useRejectionTemplates,
  useCreateRejectionTemplate,
  useUpdateRejectionTemplate,
  useDeleteRejectionTemplate,
} from "@/hooks/use-timesheets";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, Plus, Pencil, Trash2, X, Check } from "lucide-react";

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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Timesheet Settings
          </DialogTitle>
          <DialogDescription>
            Configure organization-level timesheet rules and rejection templates.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="policies" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="templates">Rejection Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="policies">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4 pt-2">
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

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={updateSettings.isPending}>
                    {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Policies
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <RejectionTemplateManager organizationId={organizationId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RejectionTemplateManager({ organizationId }: { organizationId: number | null }) {
  const { data: templates = [], isLoading } = useRejectionTemplates(organizationId);
  const createTemplate = useCreateRejectionTemplate();
  const updateTemplate = useUpdateRejectionTemplate();
  const deleteTemplate = useDeleteRejectionTemplate();
  const { toast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("general");

  const handleCreate = async () => {
    if (!organizationId || !name.trim() || !text.trim()) return;
    try {
      await createTemplate.mutateAsync({ organizationId, name: name.trim(), text: text.trim(), category });
      toast({ title: "Template Created" });
      setIsAdding(false);
      setName("");
      setText("");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to create template", variant: "destructive" });
    }
  };

  const handleUpdate = async (id: number) => {
    if (!organizationId || !name.trim() || !text.trim()) return;
    try {
      await updateTemplate.mutateAsync({ id, organizationId, name: name.trim(), text: text.trim(), category });
      toast({ title: "Template Updated" });
      setEditingId(null);
      setName("");
      setText("");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update template", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!organizationId) return;
    try {
      await deleteTemplate.mutateAsync({ id, organizationId });
      toast({ title: "Template Deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete template", variant: "destructive" });
    }
  };

  const startEdit = (template: typeof templates[0]) => {
    setEditingId(template.id);
    setName(template.name);
    setText(template.text);
    setCategory(template.category || "general");
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setName("");
    setText("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Templates available when rejecting timesheet entries
        </p>
        {!isAdding && !editingId && (
          <Button size="sm" variant="outline" onClick={() => { setIsAdding(true); setName(""); setText(""); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {(isAdding || editingId) && (
        <Card className="p-3 space-y-2 border-primary/30">
          <Input
            placeholder="Template name (e.g., Missing Details)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
          <Textarea
            placeholder="Rejection message text..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="text-sm min-h-[60px]"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={editingId ? () => handleUpdate(editingId) : handleCreate}
              disabled={!name.trim() || !text.trim()}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {templates.map(template => (
          <Card key={template.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{template.name}</span>
                  {template.category && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{template.category}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.text}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(template)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(template.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-center py-4 text-sm text-muted-foreground">
            No rejection templates yet. Click Add to create one.
          </p>
        )}
      </div>
    </div>
  );
}
