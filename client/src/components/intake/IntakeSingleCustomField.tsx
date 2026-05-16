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
import { useCustomFieldDefinitions, useIntakeCustomFieldValues, useUpdateIntakeCustomFieldValue } from "@/hooks/use-custom-fields";
import { useResources } from "@/hooks/use-resources";
import { AttachmentFieldInput, AttachmentFieldDisplay } from "@/components/custom-fields/AttachmentField";
import { useToast } from "@/hooks/use-toast";
import type { CustomFieldDefinition } from "@shared/schema";

export function IntakeSingleCustomField({
  intakeId,
  organizationId,
  definitionId,
  isLocked,
  labelOverride,
  isRequiredOverride,
}: {
  intakeId: number;
  organizationId: number | undefined;
  definitionId: number;
  isLocked: boolean;
  labelOverride?: string | null;
  isRequiredOverride?: boolean;
}) {
  const { toast } = useToast();
  const { data: allDefinitions = [], isLoading: defsLoading } = useCustomFieldDefinitions(organizationId);
  const { data: values = [], isLoading: valsLoading } = useIntakeCustomFieldValues(intakeId);
  const { data: orgResources = [] } = useResources(organizationId ?? null);
  const updateValue = useUpdateIntakeCustomFieldValue();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>("");

  if (defsLoading || valsLoading) return null;
  const field = allDefinitions.find(d => d.id === definitionId);
  if (!field) {
    return (
      <div className="text-xs text-destructive" data-testid={`custom-field-missing-${definitionId}`}>
        Custom field not found (id {definitionId}). It may have been deleted — remove it from the layout.
      </div>
    );
  }
  const fieldEntity = field.entityType || 'project';
  if (fieldEntity !== 'intake' && fieldEntity !== 'project') {
    return (
      <div className="text-xs text-destructive" data-testid={`custom-field-wrong-entity-${definitionId}`}>
        "{field.name}" is not an intake or project custom field — remove it from the intake form layout.
      </div>
    );
  }
  const value = values.find(v => v.fieldDefinitionId === definitionId)?.value || "";

  const startEdit = () => {
    if (isLocked || field.fieldType === "autonumber") return;
    setEditValue(value);
    setIsEditing(true);
  };
  const cancelEdit = () => { setIsEditing(false); setEditValue(""); };
  const save = async () => {
    try {
      await updateValue.mutateAsync({ intakeId, fieldDefinitionId: definitionId, value: editValue || null });
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
        return <Checkbox checked={editValue === "true"} onCheckedChange={(c) => setEditValue(c ? "true" : "false")} data-testid={`input-intake-cf-${field.id}`} />;
      case "select":
        return (
          <SearchableSelect
            value={editValue}
            onValueChange={setEditValue}
            placeholder="Select..."
            options={(field.options as string[] || []).map(o => ({ value: o, label: o }))}
            testId={`select-intake-cf-${field.id}`}
          />
        );
      case "resource":
        return (
          <SearchableSelect
            value={editValue}
            onValueChange={setEditValue}
            placeholder="Select resource..."
            options={orgResources.map(r => ({ value: String(r.id), label: r.displayName }))}
            testId={`select-intake-cf-resource-${field.id}`}
          />
        );
      case "attachment":
        return <AttachmentFieldInput value={editValue} onChange={setEditValue} testId={`attachment-intake-cf-${field.id}`} />;
      case "multiselect": {
        const sel = parseMulti(editValue);
        return (
          <div className="flex flex-wrap gap-1" data-testid={`multiselect-intake-cf-${field.id}`}>
            {(field.options as string[] || []).map(o => (
              <Badge key={o} variant={sel.includes(o) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleMulti(o)}>{o}</Badge>
            ))}
          </div>
        );
      }
      case "date":
        return <Input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-cf-${field.id}`} />;
      case "number":
        return <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-cf-${field.id}`} />;
      case "url":
        return <Input type="url" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="https://..." data-testid={`input-intake-cf-${field.id}`} />;
      default:
        return <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-cf-${field.id}`} />;
    }
  };

  const renderValue = () => {
    if (field.fieldType === "autonumber") {
      if (!value) return <span className="text-muted-foreground text-sm italic" data-testid={`value-intake-autonumber-pending-${field.id}`}>Pending…</span>;
      return <span className="text-sm font-mono font-medium" data-testid={`value-intake-autonumber-${field.id}`}>{value}</span>;
    }
    if (field.fieldType === "attachment") return <AttachmentFieldDisplay value={value} testId={`value-intake-attachment-${field.id}`} />;
    if (!value) return <span className="text-muted-foreground text-sm" data-testid={`value-intake-empty-${field.id}`}>Not set</span>;
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
      case "resource": {
        const r = orgResources.find(r => String(r.id) === String(value));
        return <span className="text-sm">{r?.displayName ?? "Unknown resource"}</span>;
      }
      default:
        return <span className="text-sm">{value}</span>;
    }
  };

  return (
    <div className="space-y-2" data-testid={`intake-single-cf-${field.id}`}>
      <Label className="text-sm flex items-center gap-1">
        {labelOverride && labelOverride.trim() ? labelOverride.trim() : field.name}
        {(field.isRequired || isRequiredOverride) && <span className="text-destructive">*</span>}
      </Label>
      {isEditing ? (
        <div className="flex items-center gap-2">
          {renderInput()}
          <Button size="icon" variant="ghost" onClick={save} data-testid={`button-save-intake-cf-${field.id}`}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={cancelEdit} data-testid={`button-cancel-intake-cf-${field.id}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          {renderValue()}
          {!isLocked && field.fieldType !== "autonumber" && (
            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={startEdit} data-testid={`button-edit-intake-cf-${field.id}`}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
