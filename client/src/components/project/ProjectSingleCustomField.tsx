import { useState } from "react";
import { format } from "date-fns";
import { Check, X, ExternalLink, Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCustomFieldDefinitions, useProjectCustomFieldValues, useUpdateProjectCustomFieldValue } from "@/hooks/use-custom-fields";
import { useResources } from "@/hooks/use-resources";
import { useTasks } from "@/hooks/use-tasks";
import { AttachmentFieldInput, AttachmentFieldDisplay } from "@/components/custom-fields/AttachmentField";
import { useToast } from "@/hooks/use-toast";

export function ProjectSingleCustomField({
  projectId,
  organizationId,
  definitionId,
  isLocked,
  project,
  labelOverride,
  isRequiredOverride,
}: {
  projectId: number;
  organizationId: number | undefined;
  definitionId: number;
  isLocked: boolean;
  project?: { createdAt?: string | Date | null; updatedAt?: string | Date | null } | null;
  labelOverride?: string | null;
  isRequiredOverride?: boolean;
}) {
  const { toast } = useToast();
  const { data: allDefinitions = [], isLoading: defsLoading } = useCustomFieldDefinitions(organizationId);
  const { data: values = [], isLoading: valsLoading } = useProjectCustomFieldValues(projectId);
  const { data: orgResources = [] } = useResources(organizationId ?? null);
  const updateValue = useUpdateProjectCustomFieldValue();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>("");

  const field = allDefinitions.find(d => d.id === definitionId);
  const needsTasks = field?.fieldType === "effort_completed_hours" || field?.fieldType === "effort_remaining_hours";
  const { data: projectTasks = [] } = useTasks(needsTasks ? projectId : 0);

  if (defsLoading || valsLoading) return null;
  if (!field) {
    return (
      <div className="text-xs text-destructive" data-testid={`project-cf-missing-${definitionId}`}>
        Custom field not found (id {definitionId}). It may have been deleted — remove it from the layout.
      </div>
    );
  }
  const fieldEntity = field.entityType || 'project';
  if (fieldEntity !== 'project' && fieldEntity !== 'intake') {
    return (
      <div className="text-xs text-destructive" data-testid={`project-cf-wrong-entity-${definitionId}`}>
        "{field.name}" is not a project or intake custom field — remove it from the project form layout.
      </div>
    );
  }
  const value = values.find(v => v.fieldDefinitionId === definitionId)?.value || "";

  const isComputed = field.fieldType === "days_since_updated"
    || field.fieldType === "days_since_created"
    || field.fieldType === "effort_completed_hours"
    || field.fieldType === "effort_remaining_hours";
  const startEdit = () => {
    if (isLocked || field.fieldType === "autonumber" || isComputed) return;
    setEditValue(value);
    setIsEditing(true);
  };

  const computeDaysSince = (raw: string | Date | null | undefined): number | null => {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  };
  const cancelEdit = () => { setIsEditing(false); setEditValue(""); };
  const save = async () => {
    try {
      await updateValue.mutateAsync({ projectId, fieldDefinitionId: definitionId, value: editValue || null });
      toast({ title: "Saved" });
      setIsEditing(false);
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  const parseMulti = (v: string): string[] => { if (!v) return []; try { return JSON.parse(v); } catch { return v ? [v] : []; } };
  const toggleMulti = (opt: string) => {
    const current = parseMulti(editValue);
    setEditValue(JSON.stringify(current.includes(opt) ? current.filter(v => v !== opt) : [...current, opt]));
  };

  const renderInput = () => {
    switch (field.fieldType) {
      case "checkbox":
        return <Checkbox checked={editValue === "true"} onCheckedChange={(c) => setEditValue(c ? "true" : "false")} data-testid={`input-project-cf-${field.id}`} />;
      case "select":
        return (
          <SearchableSelect
            value={editValue}
            onValueChange={setEditValue}
            placeholder="Select..."
            options={(field.options as string[] || []).map(o => ({ value: o, label: o }))}
            testId={`select-project-cf-${field.id}`}
          />
        );
      case "resource":
        return (
          <SearchableSelect
            value={editValue}
            onValueChange={setEditValue}
            placeholder="Select resource..."
            options={orgResources.map(r => ({ value: String(r.id), label: r.displayName }))}
            testId={`select-project-cf-resource-${field.id}`}
          />
        );
      case "attachment":
        return <AttachmentFieldInput value={editValue} onChange={setEditValue} testId={`attachment-project-cf-${field.id}`} />;
      case "rag":
        return (
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger data-testid={`select-project-cf-rag-${field.id}`}><SelectValue placeholder="Select status..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Green"><span className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />Green</span></SelectItem>
              <SelectItem value="Yellow"><span className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />Yellow</span></SelectItem>
              <SelectItem value="Red"><span className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />Red</span></SelectItem>
            </SelectContent>
          </Select>
        );
      case "multiselect": {
        const sel = parseMulti(editValue);
        return (
          <div className="flex flex-wrap gap-1" data-testid={`multiselect-project-cf-${field.id}`}>
            {(field.options as string[] || []).map(o => (
              <Badge key={o} variant={sel.includes(o) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleMulti(o)}>{o}</Badge>
            ))}
          </div>
        );
      }
      case "date":
        return <Input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-project-cf-${field.id}`} />;
      case "number":
        return <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-project-cf-${field.id}`} />;
      case "percentage":
        return (
          <div className="relative w-full">
            <Input
              type="number"
              step="0.01"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="pr-7"
              data-testid={`input-project-cf-${field.id}`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        );
      case "url":
        return <Input type="url" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="https://..." data-testid={`input-project-cf-${field.id}`} />;
      default:
        return <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-project-cf-${field.id}`} />;
    }
  };

  const formatHours = (n: number) => {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  };
  const renderValue = () => {
    if (field.fieldType === "days_since_updated" || field.fieldType === "days_since_created") {
      const src = field.fieldType === "days_since_updated" ? project?.updatedAt : project?.createdAt;
      const days = computeDaysSince(src ?? null);
      if (days == null) return <span className="text-muted-foreground text-sm" data-testid={`value-project-computed-empty-${field.id}`}>—</span>;
      return <span className="text-sm" data-testid={`value-project-computed-${field.id}`}>{days} {days === 1 ? "day" : "days"}</span>;
    }
    if (field.fieldType === "effort_completed_hours" || field.fieldType === "effort_remaining_hours") {
      // Sum across leaf tasks only (tasks with no children) to avoid double-
      // counting parent rollups.
      const childIds = new Set<number>();
      projectTasks.forEach(t => { if (t.parentId != null) childIds.add(t.parentId); });
      const leaves = projectTasks.filter(t => !childIds.has(t.id));
      const num = (v: any) => {
        const n = typeof v === "number" ? v : v == null ? NaN : parseFloat(String(v));
        return Number.isFinite(n) ? n : 0;
      };
      let total = 0;
      if (field.fieldType === "effort_completed_hours") {
        total = leaves.reduce((sum, t) => sum + num((t as any).actualHours), 0);
      } else {
        total = leaves.reduce((sum, t) => {
          const remaining = (t as any).remainingHours;
          if (remaining != null && remaining !== "") return sum + Math.max(0, num(remaining));
          // Fallback: estimated - actual, never negative.
          return sum + Math.max(0, num((t as any).estimatedHours) - num((t as any).actualHours));
        }, 0);
      }
      return <span className="text-sm" data-testid={`value-project-computed-${field.id}`}>{formatHours(total)} h</span>;
    }
    if (field.fieldType === "autonumber") {
      if (!value) return <span className="text-muted-foreground text-sm italic" data-testid={`value-project-autonumber-pending-${field.id}`}>Pending…</span>;
      return <span className="text-sm font-mono font-medium" data-testid={`value-project-autonumber-${field.id}`}>{value}</span>;
    }
    if (field.fieldType === "attachment") return <AttachmentFieldDisplay value={value} testId={`value-project-attachment-${field.id}`} />;
    if (!value) return <span className="text-muted-foreground text-sm" data-testid={`value-project-empty-${field.id}`}>Not set</span>;
    switch (field.fieldType) {
      case "checkbox":
        return value === "true" ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />;
      case "url":
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="underline text-sm flex items-center gap-1">
            {value.length > 30 ? value.substring(0, 30) + "..." : value}<ExternalLink className="h-3 w-3" />
          </a>
        );
      case "multiselect": {
        const sel = parseMulti(value);
        return <div className="flex flex-wrap gap-1">{sel.map(v => <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>)}</div>;
      }
      case "date":
        return <span className="text-sm">{format(new Date(value), 'MMM d, yyyy')}</span>;
      case "percentage": {
        const n = Number(value);
        return <span className="text-sm">{Number.isFinite(n) ? `${n}%` : value}</span>;
      }
      case "resource": {
        const r = orgResources.find(r => String(r.id) === String(value));
        return <span className="text-sm">{r?.displayName ?? "Unknown resource"}</span>;
      }
      case "rag": {
        const v = String(value).toLowerCase();
        const cls = v === "green" ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200"
          : v === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200"
          : v === "red" ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200"
          : "bg-muted text-muted-foreground border-border";
        const dot = v === "green" ? "bg-green-500" : v === "yellow" ? "bg-yellow-400" : v === "red" ? "bg-red-500" : "bg-muted-foreground";
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`} data-testid={`value-project-rag-${field.id}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
            {value}
          </span>
        );
      }
      default:
        return <span className="text-sm">{value}</span>;
    }
  };

  return (
    <div className="space-y-2" data-testid={`project-single-cf-${field.id}`}>
      <Label className="text-sm flex items-center gap-1">
        {labelOverride && labelOverride.trim() ? labelOverride.trim() : field.name}
        {(field.isRequired || isRequiredOverride) && <span className="text-destructive">*</span>}
      </Label>
      {isEditing ? (
        <div className="flex items-center gap-2">
          {renderInput()}
          <Button size="icon" variant="ghost" onClick={save} data-testid={`button-save-project-cf-${field.id}`}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={cancelEdit} data-testid={`button-cancel-project-cf-${field.id}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          {renderValue()}
          {!isLocked && field.fieldType !== "autonumber" && !isComputed && (
            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={startEdit} data-testid={`button-edit-project-cf-${field.id}`}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
