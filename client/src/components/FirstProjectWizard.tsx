import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useUserJourney } from "@/hooks/use-user-journey";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES, DEFAULT_TASK_STATUS, DEFAULT_TASK_PRIORITY } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Rocket, ChevronRight, ChevronLeft, Plus, Trash2, CheckCircle2, Loader2, FolderPlus,
} from "lucide-react";

interface WizardTask {
  title: string;
  priority: string;
  startDate: string;
  endDate: string;
}

export function FirstProjectWizard() {
  const { shouldShowWizard, completeWizard, trackChecklistEvent } = useUserJourney();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [wizardTasks, setWizardTasks] = useState<WizardTask[]>([
    { title: "", priority: DEFAULT_TASK_PRIORITY, startDate: "", endDate: "" },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const handleAddTask = () => {
    setWizardTasks(prev => [...prev, { title: "", priority: DEFAULT_TASK_PRIORITY, startDate: "", endDate: "" }]);
  };

  const handleRemoveTask = (index: number) => {
    setWizardTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTask = (index: number, field: keyof WizardTask, value: string) => {
    setWizardTasks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const handleCreate = async () => {
    if (!currentOrganization) return;
    setIsCreating(true);

    try {
      const projectRes = await apiRequest("POST", "/api/projects", {
        name: projectName,
        description: projectDescription,
        organizationId: currentOrganization.id,
        status: "Initiation",
      });
      const project = await projectRes.json();
      trackChecklistEvent("create_project");

      const validTasks = wizardTasks.filter(t => t.title.trim());
      for (const task of validTasks) {
        await apiRequest("POST", "/api/tasks", {
          name: task.title,
          projectId: project.id,
          priority: task.priority,
          startDate: task.startDate || null,
          endDate: task.endDate || null,
          status: DEFAULT_TASK_STATUS,
        });
        trackChecklistEvent("add_task");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setCreated(true);
      toast({ title: "Project created!", description: `${projectName} with ${validTasks.length} task(s)` });
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    completeWizard();
  };

  if (!shouldShowWizard) return null;

  const steps = [
    { title: "Name Your Project", description: "Let's start with the basics" },
    { title: "Add Tasks", description: "Break your project into tasks" },
    { title: "Review & Create", description: "Ready to launch" },
  ];

  const canProceed = step === 0 ? projectName.trim().length > 0 : step === 1 ? wizardTasks.some(t => t.title.trim()) : true;

  return (
    <Dialog open={!created} onOpenChange={() => handleClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="h-5 w-5 text-violet-500" />
            <DialogTitle>{steps[step].title}</DialogTitle>
          </div>
          <DialogDescription>{steps[step].description}</DialogDescription>
          <div className="flex gap-1 mt-3">
            {steps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-violet-500' : 'bg-muted'}`} />
            ))}
          </div>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4 py-2">
            <div>
              <Label>Project Name</Label>
              <Input
                placeholder="e.g., Website Redesign"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="What is this project about?"
                value={projectDescription}
                onChange={e => setProjectDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 py-2 max-h-[350px] overflow-y-auto">
            {wizardTasks.map((task, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder={`Task ${i + 1} title`}
                    value={task.title}
                    onChange={e => handleUpdateTask(i, "title", e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Select value={task.priority} onValueChange={v => handleUpdateTask(i, "priority", v)}>
                      <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="date" className="h-8 text-xs" value={task.startDate} onChange={e => handleUpdateTask(i, "startDate", e.target.value)} />
                    <Input type="date" className="h-8 text-xs" value={task.endDate} onChange={e => handleUpdateTask(i, "endDate", e.target.value)} />
                  </div>
                </div>
                {wizardTasks.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" onClick={() => handleRemoveTask(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={handleAddTask}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <FolderPlus className="h-4 w-4 text-violet-500" />
                <span className="font-medium">{projectName}</span>
              </div>
              {projectDescription && <p className="text-sm text-muted-foreground mb-3">{projectDescription}</p>}
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground mb-2">{wizardTasks.filter(t => t.title.trim()).length} task(s)</p>
              {wizardTasks.filter(t => t.title.trim()).map((task, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{task.title}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{task.priority}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>Skip</Button>
            {step < 2 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Rocket className="h-4 w-4 mr-1" />}
                Create Project
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
