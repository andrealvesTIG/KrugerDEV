import { useState, useRef } from "react";
import { useCreateTask } from "@/hooks/use-tasks";
import { useUpdateTaskResourceAssignments, useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { ResourceAssignment, ResourceAllocation } from "@/components/ResourceAssignment";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar as CalendarIcon, Milestone as MilestoneIcon } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertTaskSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { calculateEndDateFromWorkingDays } from "@/lib/workingDays";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | null;
}

export function CreateTaskDialog({ open, onOpenChange, organizationId }: CreateTaskDialogProps) {
  const { toast } = useToast();
  const createTask = useCreateTask();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { data: projects } = useProjects(organizationId ?? null);
  const [durationInput, setDurationInput] = useState<string>("1");
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [resourceAllocations, setResourceAllocations] = useState<ResourceAllocation[]>([]);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);
  const inviteAssignedRef = useRef(false);

  const taskFormSchema = insertTaskSchema.extend({
    name: z.string().min(1, "Task name is required"),
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const form = useForm({
    resolver: zodResolver(taskFormSchema),
    mode: "onChange",
    defaultValues: {
      projectId: undefined as any,
      name: "",
      description: "",
      startDate: todayStr,
      endDate: calculateEndDateFromWorkingDays(todayStr, 1),
      durationDays: 1,
      progress: 0,
      status: "Not Started",
      assignee: "",
      baselineStartDate: null as string | null,
      baselineEndDate: null as string | null,
      isMilestone: false,
      timesheetBlocked: false,
    },
  });

  const durationDays = durationInput === "" ? null : parseInt(durationInput, 10);

  const recalculateEndDate = (newStartDate: string, newDuration: number | null) => {
    if (newStartDate && newDuration !== null && newDuration >= 0) {
      if (newDuration === 0) {
        form.setValue("endDate", newStartDate, { shouldDirty: true, shouldValidate: true });
      } else {
        const newEnd = calculateEndDateFromWorkingDays(newStartDate, newDuration);
        form.setValue("endDate", newEnd, { shouldDirty: true, shouldValidate: true });
      }
      form.setValue("durationDays", newDuration, { shouldDirty: true, shouldValidate: true });
    }
  };

  const handleDurationBlur = () => {
    const num = parseInt(durationInput, 10);
    if (durationInput === "" || isNaN(num) || num < 0) {
      setDurationInput("1");
    } else if (num > 365) {
      setDurationInput("365");
    }
  };

  const setBaselineFromCurrentDates = () => {
    const startDate = form.getValues("startDate");
    const endDate = form.getValues("endDate");
    form.setValue("baselineStartDate", startDate, { shouldDirty: true });
    form.setValue("baselineEndDate", endDate, { shouldDirty: true });
    toast({ title: "Baseline Set", description: "Current dates have been saved as baseline" });
  };

  const clearBaseline = () => {
    form.setValue("baselineStartDate", null, { shouldDirty: true });
    form.setValue("baselineEndDate", null, { shouldDirty: true });
    toast({ title: "Baseline Cleared", description: "Baseline dates have been removed" });
  };

  const calculateVariance = () => {
    const baselineEnd = form.watch("baselineEndDate");
    const actualEnd = form.watch("endDate");
    if (!baselineEnd || !actualEnd) return null;
    try {
      const baseline = parseISO(baselineEnd);
      const actual = parseISO(actualEnd);
      return differenceInDays(actual, baseline);
    } catch {
      return null;
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset({
        projectId: undefined as any,
        name: "",
        description: "",
        startDate: todayStr,
        endDate: calculateEndDateFromWorkingDays(todayStr, 1),
        durationDays: 1,
        progress: 0,
        status: "Not Started",
        assignee: "",
        baselineStartDate: null,
        baselineEndDate: null,
        isMilestone: false,
        timesheetBlocked: false,
      });
      setDurationInput("1");
      setSelectedResourceIds([]);
      setResourceAllocations([]);
      inviteAssignedRef.current = false;
    }
    onOpenChange(isOpen);
  };

  const onSubmit = (data: any) => {
    const projectId = Number(data.projectId);
    if (!projectId || isNaN(projectId)) {
      toast({ title: "Validation Error", description: "Please select a valid project.", variant: "destructive" });
      return;
    }
    const taskData = {
      projectId,
      name: data.name,
      description: data.description || null,
      startDate: data.startDate,
      endDate: data.endDate,
      durationDays: durationDays ?? 1,
      progress: data.progress || 0,
      status: data.status || "Not Started",
      assignee: data.assignee || null,
      baselineStartDate: data.baselineStartDate || null,
      baselineEndDate: data.baselineEndDate || null,
      isMilestone: data.isMilestone || false,
      timesheetBlocked: data.timesheetBlocked || false,
    };
    createTask.mutate(taskData, {
      onSuccess: (newTask: any) => {
        if (!inviteAssignedRef.current && selectedResourceIds.length > 0 && newTask?.id) {
          updateTaskResources.mutate({
            taskId: newTask.id,
            resourceIds: selectedResourceIds,
            allocations: resourceAllocations,
          });
        }
        inviteAssignedRef.current = false;
        toast({ title: "Success", description: "Task created" });
        handleOpenChange(false);
      },
      onError: (error: any) => {
        if (error?.limitExceeded) {
          setLimitError({ message: error.message, resourceType: error.resourceType });
          setLimitDialogOpen(true);
          handleOpenChange(false);
        } else {
          const msg = error?.message || "Failed to create task";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      },
    });
  };

  return (
    <>
      <LimitExceededDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        resourceType={limitError?.resourceType}
        message={limitError?.message}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>Fill in the details to create a new task.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
            <div className="space-y-2 pb-3">
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Controller
                  control={form.control}
                  name="projectId"
                  render={({ field, fieldState }) => (
                    <div className="space-y-1">
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={field.value ? String(field.value) : ""}
                      >
                        <SelectTrigger
                          data-testid="select-task-project"
                          className={cn("h-8 text-sm", fieldState.error && "border-destructive")}
                        >
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects?.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <div className="truncate max-w-[400px]" title={p.name}>
                                {p.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.error && (
                        <p className="text-xs text-destructive">{fieldState.error.message}</p>
                      )}
                    </div>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Task Name</Label>
                <Input
                  {...form.register("name")}
                  data-testid="input-task-name"
                  className={cn("h-8 text-sm", form.formState.errors.name && "border-destructive")}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
            </div>

            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
                <TabsTrigger value="resources" className="text-xs">Resources</TabsTrigger>
                <TabsTrigger value="dependencies" className="text-xs">Dependencies</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto py-4 min-h-[280px]">
                <TabsContent value="details" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Controller
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <Select
                            onValueChange={(val) => {
                              const prevStatus = field.value;
                              field.onChange(val);
                              if (val === "Not Started") {
                                form.setValue("progress", 0);
                              } else if (val === "Completed") {
                                form.setValue("progress", 100);
                              } else if (val === "In Progress" && prevStatus === "Completed") {
                                form.setValue("progress", 50);
                              }
                            }}
                            value={field.value || "Not Started"}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Not Started">Not Started</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center justify-between">
                        Progress
                        <span className="text-muted-foreground font-normal">{form.watch("progress") || 0}%</span>
                      </Label>
                      <Controller
                        control={form.control}
                        name="progress"
                        render={({ field }) => (
                          <div className="h-9 flex items-center">
                            <Slider
                              value={[field.value || 0]}
                              onValueChange={(v) => {
                                const newProgress = v[0];
                                field.onChange(newProgress);
                                const currentStatus = form.getValues("status");
                                if (newProgress === 100) {
                                  form.setValue("status", "Completed");
                                } else if (newProgress === 0) {
                                  form.setValue("status", "Not Started");
                                } else {
                                  if (currentStatus === "Completed" || currentStatus === "Not Started") {
                                    form.setValue("status", "In Progress");
                                  }
                                }
                              }}
                              min={0}
                              max={100}
                              step={5}
                              className="w-full"
                              data-testid="slider-task-progress"
                            />
                          </div>
                        )}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Textarea {...form.register("description")} className="text-sm min-h-[80px]" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Controller
                      control={form.control}
                      name="isMilestone"
                      render={({ field }) => (
                        <Checkbox
                          id="create-task-isMilestone"
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-task-milestone"
                        />
                      )}
                    />
                    <Label htmlFor="create-task-isMilestone" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                      <MilestoneIcon className="h-4 w-4 text-primary" />
                      Mark as Milestone
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Controller
                      control={form.control}
                      name="timesheetBlocked"
                      render={({ field }) => (
                        <Checkbox
                          id="create-task-timesheetBlocked"
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-timesheet-blocked"
                        />
                      )}
                    />
                    <Label htmlFor="create-task-timesheetBlocked" className="text-sm font-normal cursor-pointer">
                      Block timesheet entries for this task
                    </Label>
                  </div>
                </TabsContent>

                <TabsContent value="schedule" className="mt-0 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Start Date</Label>
                      <Controller
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <Input
                            type="date"
                            className="h-8 text-sm"
                            value={field.value || ""}
                            onChange={(e) => {
                              const newStartDate = e.target.value;
                              field.onChange(newStartDate);
                              recalculateEndDate(newStartDate, durationDays);
                            }}
                            onBlur={field.onBlur}
                            data-testid="input-task-start"
                          />
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Duration (days)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="365"
                        className="h-8 text-sm"
                        value={durationInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDurationInput(value);
                          const newDuration = value === "" ? null : parseInt(value, 10);
                          if (newDuration !== null && !isNaN(newDuration) && newDuration >= 0) {
                            const currentStartDate = form.getValues("startDate");
                            recalculateEndDate(currentStartDate, newDuration);
                          }
                        }}
                        onBlur={handleDurationBlur}
                        data-testid="input-task-duration"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End Date</Label>
                      <Controller
                        control={form.control}
                        name="endDate"
                        render={({ field }) => {
                          const currentStartDate = form.getValues("startDate");
                          return (
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={field.value || ""}
                              min={currentStartDate || undefined}
                              onChange={(e) => {
                                const newEndDate = e.target.value;
                                field.onChange(newEndDate);
                                if (currentStartDate && newEndDate && newEndDate.length === 10) {
                                  try {
                                    const start = parseISO(currentStartDate);
                                    const end = parseISO(newEndDate);
                                    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                                      const newDuration = differenceInDays(end, start) + 1;
                                      if (newDuration >= 0) {
                                        setDurationInput(String(newDuration));
                                        form.setValue("durationDays", newDuration, {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        });
                                      }
                                    }
                                  } catch {}
                                }
                              }}
                              onBlur={field.onBlur}
                              data-testid="input-task-end"
                            />
                          );
                        }}
                      />
                    </div>
                  </div>

                  <div className="border-2 border-orange-200 dark:border-orange-800 rounded-md p-3 bg-orange-50/50 dark:bg-orange-950/30 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <Label className="text-xs font-medium flex items-center gap-2">
                          <CalendarIcon className="h-3.5 w-3.5 text-orange-600" />
                          Baseline Dates
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Track schedule variance against the original plan
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={setBaselineFromCurrentDates}
                          data-testid="button-set-baseline"
                        >
                          Set Baseline
                        </Button>
                        {(form.watch("baselineStartDate") || form.watch("baselineEndDate")) && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={clearBaseline}
                            data-testid="button-clear-baseline"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>

                    {form.watch("baselineStartDate") || form.watch("baselineEndDate") ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Baseline Start</Label>
                            <Controller
                              control={form.control}
                              name="baselineStartDate"
                              render={({ field }) => (
                                <Input
                                  type="date"
                                  className="h-8 text-sm"
                                  value={field.value || ""}
                                  onChange={(e) => field.onChange(e.target.value || null)}
                                  data-testid="input-baseline-start"
                                />
                              )}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Baseline End</Label>
                            <Controller
                              control={form.control}
                              name="baselineEndDate"
                              render={({ field }) => (
                                <Input
                                  type="date"
                                  className="h-8 text-sm"
                                  value={field.value || ""}
                                  onChange={(e) => field.onChange(e.target.value || null)}
                                  data-testid="input-baseline-end"
                                />
                              )}
                            />
                          </div>
                        </div>
                        {(() => {
                          const variance = calculateVariance();
                          if (variance === null) return null;
                          return (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Schedule Variance:</span>
                              <Badge
                                variant={variance > 0 ? "destructive" : variance < 0 ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {variance > 0
                                  ? `+${variance} days (late)`
                                  : variance < 0
                                  ? `${variance} days (early)`
                                  : "On schedule"}
                              </Badge>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No baseline set. Click "Set Baseline" to save the current dates as baseline.
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="resources" className="mt-0">
                  <ResourceAssignment
                    organizationId={organizationId}
                    selectedResourceIds={selectedResourceIds}
                    onSelectionChange={setSelectedResourceIds}
                    allocations={resourceAllocations}
                    onAllocationsChange={setResourceAllocations}
                    showAllocations={true}
                    label="Assigned Resources"
                    projectId={form.watch("projectId")}
                    taskName={form.watch("name")}
                    onInviteAssigned={() => { inviteAssignedRef.current = true; }}
                  />
                </TabsContent>

                <TabsContent value="dependencies" className="mt-0">
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Save the task first to add dependencies
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="flex items-center gap-2 pt-3">
              <div className="flex-1" />
              <Button
                type="submit"
                size="sm"
                data-testid="button-save-task"
                disabled={createTask.isPending || !form.formState.isValid}
              >
                {createTask.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Save Task
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                data-testid="button-cancel-task"
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
