import { useState, useRef, useMemo } from "react";
import { useCreateTask } from "@/hooks/use-tasks";
import { useUpdateTaskResourceAssignments, useResources } from "@/hooks/use-resources";
import { useUserJourney } from "@/hooks/use-user-journey";
import { useProjects } from "@/hooks/use-projects";
import { useCustomFieldDefinitions, useUpdateTaskCustomFieldValue } from "@/hooks/use-custom-fields";
import type { CustomFieldDefinition } from "@shared/schema";
import { ResourceAssignment, ResourceAllocation } from "@/components/ResourceAssignment";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DurationInput } from "@/components/ui/duration-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TASK_STATUSES, TASK_STATUS, DEFAULT_TASK_STATUS } from "@shared/schema";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Calendar as CalendarIcon, Milestone as MilestoneIcon, RefreshCw } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertTaskSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { calculateEndDateFromWorkingDays, calculateDurationInWorkingDays, parseDurationInput, formatDuration } from "@/lib/workingDays";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | null;
}

export function CreateTaskDialog({ open, onOpenChange, organizationId }: CreateTaskDialogProps) {
  const { toast } = useToast();
  const { trackChecklistEvent } = useUserJourney();
  const createTask = useCreateTask();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { data: projects } = useProjects(organizationId ?? null);
  const { data: allCustomFieldDefs = [] } = useCustomFieldDefinitions(organizationId ?? null);
  const updateTaskCustomFieldValue = useUpdateTaskCustomFieldValue();
  const taskCustomFieldDefs = useMemo(
    () => allCustomFieldDefs.filter((d) => d.entityType === "task"),
    [allCustomFieldDefs],
  );
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [durationInput, setDurationInput] = useState<string>("1d");
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
      status: DEFAULT_TASK_STATUS,
      assignee: "",
      baselineStartDate: null as string | null,
      baselineEndDate: null as string | null,
      isMilestone: false,
      timesheetBlocked: false,
      isOngoing: false,
    },
  });

  const isOngoing = form.watch("isOngoing");

  const durationDays = parseDurationInput(durationInput);

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
    const parsed = parseDurationInput(durationInput);
    if (parsed === null || parsed < 0) {
      setDurationInput("1d");
    } else if (parsed > 365) {
      setDurationInput("365d");
    } else {
      setDurationInput(formatDuration(parsed));
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
        status: DEFAULT_TASK_STATUS,
        assignee: "",
        baselineStartDate: null,
        baselineEndDate: null,
        isMilestone: false,
        timesheetBlocked: false,
        isOngoing: false,
      });
      setDurationInput("1d");
      setSelectedResourceIds([]);
      setResourceAllocations([]);
      setCustomFieldValues({});
      inviteAssignedRef.current = false;
    }
    onOpenChange(isOpen);
  };

  const setCustomFieldValue = (fieldId: number, value: string) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const onSubmit = (data: any) => {
    const projectId = Number(data.projectId);
    if (!projectId || isNaN(projectId)) {
      toast({ title: "Validation Error", description: "Please select a valid project.", variant: "destructive" });
      return;
    }
    const missingRequired = taskCustomFieldDefs
      .filter((d) => d.isRequired)
      .filter((d) => !((customFieldValues[d.id] ?? "").trim()));
    if (missingRequired.length > 0) {
      toast({
        title: "Validation Error",
        description: `Please fill in: ${missingRequired.map((d) => d.name).join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    const taskIsOngoing = data.isOngoing || false;
    const taskData = {
      projectId,
      name: data.name,
      description: data.description || null,
      startDate: taskIsOngoing ? null : data.startDate,
      endDate: taskIsOngoing ? null : data.endDate,
      durationDays: taskIsOngoing ? null : (durationDays ?? 1),
      progress: data.progress || 0,
      status: data.status || DEFAULT_TASK_STATUS,
      assignee: data.assignee || null,
      baselineStartDate: data.baselineStartDate || null,
      baselineEndDate: data.baselineEndDate || null,
      isMilestone: taskIsOngoing ? false : (data.isMilestone || false),
      timesheetBlocked: data.timesheetBlocked || false,
      isOngoing: taskIsOngoing,
      taskType: taskIsOngoing ? "Ongoing" : undefined,
    };
    createTask.mutate(taskData, {
      onSuccess: (newTask: any) => {
        if (!inviteAssignedRef.current && selectedResourceIds.length > 0 && newTask?.id) {
          trackChecklistEvent("assign_member");
          updateTaskResources.mutate({
            taskId: newTask.id,
            resourceIds: selectedResourceIds,
            allocations: resourceAllocations,
          }, {
            onError: () => {
              toast({ title: "Warning", description: "Task created but resource assignment failed. Please assign resources manually.", variant: "destructive" });
            },
          });
        }
        if (newTask?.id) {
          for (const def of taskCustomFieldDefs) {
            const raw = customFieldValues[def.id];
            if (raw === undefined) continue;
            const trimmed = raw.trim();
            if (trimmed === "") continue;
            updateTaskCustomFieldValue.mutate({
              taskId: newTask.id,
              fieldDefinitionId: def.id,
              value: trimmed,
            });
          }
        }
        inviteAssignedRef.current = false;
        trackChecklistEvent("add_task");
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
            <DialogDescription className="sr-only">Fill in the details to create a new task.</DialogDescription>
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
                              if (val === TASK_STATUS.NOT_STARTED) {
                                form.setValue("progress", 0);
                              } else if (val === TASK_STATUS.COMPLETED) {
                                form.setValue("progress", 100);
                              } else if (val === TASK_STATUS.IN_PROGRESS && prevStatus === TASK_STATUS.COMPLETED) {
                                form.setValue("progress", 50);
                              }
                            }}
                            value={field.value || DEFAULT_TASK_STATUS}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                              ))}
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
                                  form.setValue("status", TASK_STATUS.COMPLETED);
                                } else if (newProgress === 0) {
                                  form.setValue("status", TASK_STATUS.NOT_STARTED);
                                } else {
                                  if (currentStatus === TASK_STATUS.COMPLETED || currentStatus === TASK_STATUS.NOT_STARTED) {
                                    form.setValue("status", TASK_STATUS.IN_PROGRESS);
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
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="create-task-isOngoing" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-violet-500" />
                        Ongoing Task
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        For operations or internal work without scheduled dates
                      </p>
                    </div>
                    <Controller
                      control={form.control}
                      name="isOngoing"
                      render={({ field }) => (
                        <Switch
                          id="create-task-isOngoing"
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                          data-testid="switch-task-ongoing"
                        />
                      )}
                    />
                  </div>
                  {!isOngoing && (
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
                  )}
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

                  {taskCustomFieldDefs.length > 0 && (
                    <div className="space-y-3 pt-2 border-t">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Custom Fields
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {taskCustomFieldDefs.map((field: CustomFieldDefinition) => {
                          const value = customFieldValues[field.id] ?? "";
                          const fieldId = `cf-create-task-${field.id}`;
                          const opts = (field.options as string[] | null | undefined) ?? [];
                          return (
                            <div key={field.id} className="space-y-1">
                              <Label htmlFor={fieldId} className="text-xs">
                                {field.name}
                                {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                              </Label>
                              {field.fieldType === "checkbox" ? (
                                <div className="flex items-center h-8">
                                  <Checkbox
                                    id={fieldId}
                                    checked={value === "true"}
                                    onCheckedChange={(checked) => setCustomFieldValue(field.id, checked ? "true" : "false")}
                                    data-testid={`input-cf-${field.id}`}
                                  />
                                </div>
                              ) : field.fieldType === "select" ? (
                                <Select
                                  value={value}
                                  onValueChange={(v) => setCustomFieldValue(field.id, v)}
                                >
                                  <SelectTrigger id={fieldId} className="h-8 text-sm" data-testid={`input-cf-${field.id}`}>
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {opts.map((opt) => (
                                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : field.fieldType === "multiselect" ? (
                                <div className="flex flex-wrap gap-1.5" data-testid={`input-cf-${field.id}`}>
                                  {opts.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No options configured.</p>
                                  ) : opts.map((opt) => {
                                    const selected = value ? value.split(",").map((s) => s.trim()).includes(opt) : false;
                                    return (
                                      <Badge
                                        key={opt}
                                        variant={selected ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => {
                                          const current = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
                                          const next = current.includes(opt)
                                            ? current.filter((o) => o !== opt)
                                            : [...current, opt];
                                          setCustomFieldValue(field.id, next.join(","));
                                        }}
                                      >
                                        {opt}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              ) : field.fieldType === "date" ? (
                                <Input
                                  id={fieldId}
                                  type="date"
                                  className="h-8 text-sm"
                                  value={value}
                                  onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
                                  data-testid={`input-cf-${field.id}`}
                                />
                              ) : field.fieldType === "number" ? (
                                <Input
                                  id={fieldId}
                                  type="number"
                                  className="h-8 text-sm"
                                  value={value}
                                  onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
                                  data-testid={`input-cf-${field.id}`}
                                />
                              ) : field.fieldType === "url" ? (
                                <Input
                                  id={fieldId}
                                  type="url"
                                  placeholder="https://..."
                                  className="h-8 text-sm"
                                  value={value}
                                  onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
                                  data-testid={`input-cf-${field.id}`}
                                />
                              ) : (
                                <Input
                                  id={fieldId}
                                  type="text"
                                  className="h-8 text-sm"
                                  value={value}
                                  onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
                                  data-testid={`input-cf-${field.id}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="schedule" className="mt-0 space-y-4">
                  {isOngoing ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                      <RefreshCw className="h-8 w-8 text-violet-400" />
                      <p className="text-sm font-medium">Ongoing Task</p>
                      <p className="text-xs text-muted-foreground max-w-[300px]">
                        This task has no scheduled dates. It represents continuous or operational work that runs indefinitely.
                      </p>
                    </div>
                  ) : (
                  <>
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
                      <Label className="text-xs">Duration</Label>
                      <DurationInput
                        className="h-8 text-sm"
                        value={durationInput}
                        onChange={(value, parsed) => {
                          setDurationInput(value);
                          if (parsed !== null && parsed >= 0) {
                            const currentStartDate = form.getValues("startDate");
                            recalculateEndDate(currentStartDate, parsed);
                          }
                        }}
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
                                    const newDuration = calculateDurationInWorkingDays(currentStartDate, newEndDate);
                                    if (newDuration >= 0) {
                                      setDurationInput(formatDuration(newDuration));
                                      form.setValue("durationDays", newDuration, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      });
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
                  </>
                  )}
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
