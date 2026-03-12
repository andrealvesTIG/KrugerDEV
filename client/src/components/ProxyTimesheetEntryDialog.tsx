import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { useCreateProxyTimesheetEntry } from "@/hooks/use-timesheets";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ProxyTimesheetEntryDialogProps {
  organizationId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProxyTimesheetEntryDialog({ organizationId, open, onOpenChange }: ProxyTimesheetEntryDialogProps) {
  const { toast } = useToast();
  const { data: resources = [] } = useResources(organizationId);
  const { data: projects = [] } = useProjects(organizationId);
  const createProxy = useCreateProxyTimesheetEntry();

  const [targetResourceId, setTargetResourceId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");

  const selectedProject = projects.find((p: any) => p.id === Number(projectId));

  const { data: tasks = [] } = useQuery({
    queryKey: ["/api/projects", Number(projectId), "tasks"],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const teamMembers = resources.filter((r: any) => r.userId);

  const resetForm = () => {
    setTargetResourceId("");
    setProjectId("");
    setTaskId("");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setHours("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!organizationId || !targetResourceId || !projectId || !taskId || !hours) {
      toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    try {
      await createProxy.mutateAsync({
        organizationId,
        targetResourceId: Number(targetResourceId),
        taskId: Number(taskId),
        projectId: Number(projectId),
        entryDate,
        hours: Number(hours),
        notes: notes || undefined,
      });

      const resource = teamMembers.find((r: any) => r.id === Number(targetResourceId));
      toast({ title: "Proxy entry created", description: `Time entry created on behalf of ${resource?.name || "team member"}` });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      const message = err?.message || "Failed to create proxy entry";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Enter Time on Behalf of Team Member
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Team Member *</Label>
            <Select value={targetResourceId} onValueChange={setTargetResourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((r: any) => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTaskId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Task *</Label>
            <Select value={taskId} onValueChange={setTaskId} disabled={!projectId}>
              <SelectTrigger>
                <SelectValue placeholder={projectId ? "Select task" : "Select a project first"} />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Date *</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Hours *</Label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for this entry..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createProxy.isPending}>
            {createProxy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
