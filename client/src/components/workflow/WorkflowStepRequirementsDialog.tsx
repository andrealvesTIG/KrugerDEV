import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Info } from "lucide-react";
import {
  useCustomFieldDefinitions,
  useProjectCustomFieldValues,
  useIntakeCustomFieldValues,
  useBulkUpdateProjectCustomFieldValues,
  useUpdateIntakeCustomFieldValue,
} from "@/hooks/use-custom-fields";
import { AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import { PROJECT_FORM_FIELD_BY_KEY, type ProjectFieldDefinition } from "@shared/projectFormRegistry";
import type { CustomFieldDefinition } from "@shared/schema";

export type WorkflowEntityType = "intake" | "project";

interface StepInfo {
  stepKey: string;
  label: string;
  helpText?: string | null;
  description?: string | null;
  requiredFields?: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: WorkflowEntityType;
  entityId: number;
  organizationId: number;
  step: StepInfo;
  /** When provided AND isCurrentStep is true, a "Save & Advance" button is shown. */
  nextStep?: { stepKey: string; label: string } | null;
  /** True when this dialog is being opened on the *current* gate. Required to show advance. */
  isCurrentStep?: boolean;
  /** Whether the entity is locked from edits (e.g. terminal status / read-only). */
  isLocked?: boolean;
}

interface FieldDescriptor {
  key: string;            // raw key ("description" or "cf:12")
  label: string;
  isCustom: boolean;
  customDef?: CustomFieldDefinition;
  builtin?: ProjectFieldDefinition | { key: string; label: string }; // intake fields are simpler
  required: boolean;
}

function builtinIntakeField(key: string) {
  return AVAILABLE_INTAKE_FIELDS.find(f => f.key === key);
}

function getEntityEndpoint(t: WorkflowEntityType, id: number) {
  return t === "intake" ? `/api/project-intakes/${id}` : `/api/projects/${id}`;
}

function getEntityQueryKey(t: WorkflowEntityType, id: number) {
  return t === "intake" ? ['/api/project-intakes', id] : ['/api/projects', id];
}

export function WorkflowStepRequirementsDialog({
  open, onOpenChange, entityType, entityId, organizationId,
  step, nextStep, isCurrentStep = false, isLocked = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch entity for built-in field values.
  const entityQuery = useQuery<any>({
    queryKey: getEntityQueryKey(entityType, entityId),
    enabled: open,
  });
  const entity = entityQuery.data;

  // Custom field defs scoped to this entity type. Intake fields share with project.
  const { data: allCfDefs = [] } = useCustomFieldDefinitions(organizationId);
  const cfDefs = useMemo(() => allCfDefs.filter(d => {
    const et = d.entityType || 'project';
    if (entityType === 'project') return et === 'project';
    return et === 'intake' || et === 'project';
  }), [allCfDefs, entityType]);

  const projectCfValuesQ = useProjectCustomFieldValues(entityType === 'project' ? entityId : null);
  const intakeCfValuesQ = useIntakeCustomFieldValues(entityType === 'intake' ? entityId : null);
  const cfValues = (entityType === 'project' ? projectCfValuesQ.data : intakeCfValuesQ.data) || [];

  const bulkUpdateProjectCfs = useBulkUpdateProjectCustomFieldValues();
  const updateIntakeCf = useUpdateIntakeCustomFieldValue();

  // Build the displayed-field list. Always include required fields. Optional
  // fields aren't shown to keep the dialog focused on the gate.
  const fields = useMemo<FieldDescriptor[]>(() => {
    const required = step.requiredFields || [];
    const list: FieldDescriptor[] = [];
    for (const key of required) {
      if (key.startsWith('cf:')) {
        const id = Number(key.slice(3));
        const def = cfDefs.find(d => d.id === id);
        if (def) list.push({ key, label: def.name, isCustom: true, customDef: def, required: true });
        else list.push({ key, label: key, isCustom: true, required: true });
      } else if (entityType === 'project') {
        const f = PROJECT_FORM_FIELD_BY_KEY[key];
        list.push({ key, label: f?.label || key, isCustom: false, builtin: f, required: true });
      } else {
        const f = builtinIntakeField(key);
        list.push({ key, label: f?.label || key, isCustom: false, builtin: f, required: true });
      }
    }
    return list;
  }, [step.requiredFields, cfDefs, entityType]);

  // Local form state, initialised from entity / cf values when dialog opens
  // or step changes.
  const [draft, setDraft] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!open || !entity) return;
    const next: Record<string, any> = {};
    for (const f of fields) {
      if (f.isCustom) {
        const v = cfValues.find(cv => cv.fieldDefinitionId === f.customDef?.id)?.value ?? "";
        next[f.key] = v ?? "";
      } else {
        const raw = entity[f.key];
        next[f.key] = raw == null ? "" : raw;
      }
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId, step.stepKey, entity, cfValues.length]);

  const validationErrors = useMemo<string[]>(() => {
    const errs: string[] = [];
    for (const f of fields) {
      if (!f.required) continue;
      const v = draft[f.key];
      if (f.isCustom) {
        const trimmed = (v ?? "").toString().trim();
        const ft = f.customDef?.fieldType;
        const empty = trimmed.length === 0
          || (ft === 'checkbox' && trimmed !== 'true')
          || (ft === 'multiselect' && (trimmed === '[]' || trimmed === 'null'));
        if (empty) errs.push(`${f.label} is required`);
      } else {
        if (v == null) { errs.push(`${f.label} is required`); continue; }
        if (typeof v === 'string' && !v.trim()) errs.push(`${f.label} is required`);
        else if (typeof v === 'number' && v <= 0) errs.push(`${f.label} is required`);
      }
    }
    return errs;
  }, [draft, fields]);

  const [isSaving, setIsSaving] = useState(false);

  const persist = async (): Promise<boolean> => {
    if (!entity) return false;
    // Split changes into built-in vs custom field updates.
    const builtinChanges: Record<string, any> = {};
    const cfChanges: Array<{ fieldDefinitionId: number; value: string | null }> = [];
    for (const f of fields) {
      const v = draft[f.key];
      if (f.isCustom) {
        if (!f.customDef) continue;
        const prev = cfValues.find(cv => cv.fieldDefinitionId === f.customDef!.id)?.value ?? "";
        if ((v ?? "") !== prev) {
          cfChanges.push({ fieldDefinitionId: f.customDef.id, value: v == null || v === "" ? null : String(v) });
        }
      } else {
        const prev = entity[f.key];
        const nextVal = v === "" ? null : v;
        if ((prev ?? null) !== nextVal) builtinChanges[f.key] = nextVal;
      }
    }

    if (Object.keys(builtinChanges).length > 0) {
      await apiRequest('PUT', getEntityEndpoint(entityType, entityId), builtinChanges);
    }
    if (cfChanges.length > 0) {
      if (entityType === 'project') {
        await bulkUpdateProjectCfs.mutateAsync({ projectId: entityId, values: cfChanges });
      } else {
        for (const c of cfChanges) {
          await updateIntakeCf.mutateAsync({ intakeId: entityId, fieldDefinitionId: c.fieldDefinitionId, value: c.value });
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: getEntityQueryKey(entityType, entityId) });
    return true;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await persist();
      toast({ title: "Saved", description: "Step requirements updated." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "Could not save changes", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndAdvance = async () => {
    if (validationErrors.length > 0) {
      toast({ title: "Gate requirements not met", description: validationErrors.join('; '), variant: "destructive" });
      return;
    }
    if (!nextStep) return;
    setIsSaving(true);
    try {
      await persist();
      const advanceField = entityType === 'intake' ? 'currentStep' : 'status';
      await apiRequest('PUT', getEntityEndpoint(entityType, entityId), { [advanceField]: nextStep.stepKey });
      queryClient.invalidateQueries({ queryKey: getEntityQueryKey(entityType, entityId) });
      toast({ title: "Advanced", description: `Moved to ${nextStep.label}.` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Could not advance", description: err?.message || "Failed to advance to next step", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (f: FieldDescriptor) => {
    const v = draft[f.key] ?? "";
    const set = (val: any) => setDraft(prev => ({ ...prev, [f.key]: val }));
    const disabled = isLocked || isSaving;

    if (f.isCustom && f.customDef) {
      const def = f.customDef;
      switch (def.fieldType) {
        case 'textarea':
          return <Textarea value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} className="resize-none" rows={3} data-testid={`wsd-input-${f.key}`} />;
        case 'number':
        case 'currency':
        case 'percentage':
          return <Input type="number" value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
        case 'date':
          return <Input type="date" value={String(v).slice(0, 10)} onChange={e => set(e.target.value)} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
        case 'checkbox':
          return (
            <Checkbox
              checked={String(v) === 'true'}
              onCheckedChange={c => set(c ? 'true' : 'false')}
              disabled={disabled}
              data-testid={`wsd-input-${f.key}`}
            />
          );
        case 'select': {
          const options = (def.options as string[] | null) || [];
          return (
            <Select value={String(v)} onValueChange={set} disabled={disabled}>
              <SelectTrigger data-testid={`wsd-input-${f.key}`}><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          );
        }
        default:
          return <Input value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
      }
    }

    // Built-in fields
    if (entityType === 'project') {
      const def = f.builtin as ProjectFieldDefinition | undefined;
      const it = def?.inputType || 'text';
      switch (it) {
        case 'textarea':
          return <Textarea value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} rows={def?.rows || 3} placeholder={def?.placeholder} className="resize-none" data-testid={`wsd-input-${f.key}`} />;
        case 'number':
        case 'currency':
        case 'percentage':
          return <Input type="number" value={String(v)} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
        case 'date':
          return <Input type="date" value={String(v).slice(0, 10)} onChange={e => set(e.target.value)} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
        case 'select': {
          const options = def?.options || [];
          return (
            <Select value={String(v)} onValueChange={set} disabled={disabled}>
              <SelectTrigger data-testid={`wsd-input-${f.key}`}><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          );
        }
        default:
          return <Input value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} placeholder={def?.placeholder} data-testid={`wsd-input-${f.key}`} />;
      }
    }

    // Intake built-in: simple text/textarea heuristic
    const longish = ['description', 'businessProblem', 'desiredOutcome', 'financialJustification', 'resourceRequirements', 'cyberRiskAssessment'].includes(f.key);
    return longish
      ? <Textarea value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} rows={3} className="resize-none" data-testid={`wsd-input-${f.key}`} />
      : <Input value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
  };

  const canAdvance = isCurrentStep && !!nextStep && !isLocked && validationErrors.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="workflow-step-dialog">
        <DialogHeader>
          <DialogTitle>{step.label}</DialogTitle>
          {step.description && <DialogDescription>{step.description}</DialogDescription>}
        </DialogHeader>

        {step.helpText && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{step.helpText}</AlertDescription>
          </Alert>
        )}

        {entityQuery.isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No required fields are configured for this step. Use Settings → Governance → Project Workflow to define what users must complete here.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            {fields.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`wsd-${f.key}`} className="flex items-center gap-1.5">
                  <span>{f.label}</span>
                  {f.required && <span className="text-destructive">*</span>}
                </Label>
                {renderInput(f)}
              </div>
            ))}
            {validationErrors.length > 0 && isCurrentStep && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">Required before advancing:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    {validationErrors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} data-testid="wsd-button-cancel">
            Close
          </Button>
          {!isLocked && fields.length > 0 && (
            <Button variant="secondary" onClick={handleSave} disabled={isSaving} data-testid="wsd-button-save">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          )}
          {isCurrentStep && nextStep && (
            <Button
              onClick={handleSaveAndAdvance}
              disabled={isSaving || !canAdvance}
              data-testid="wsd-button-advance"
              title={!canAdvance && validationErrors.length > 0 ? "Complete required fields first" : undefined}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save &amp; Advance to {nextStep.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
