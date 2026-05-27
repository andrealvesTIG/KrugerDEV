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
import { useResources } from "@/hooks/use-resources";
import { useProjectFormLayout } from "@/hooks/use-project-form-layout";
import { useIntakeTabLayout } from "@/hooks/use-intake-tab-layout";
import { useIntakeGovernanceQuestions } from "@/hooks/use-intake-governance-questions";
import { AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import { PROJECT_FORM_FIELD_BY_KEY, type ProjectFieldDefinition } from "@shared/projectFormRegistry";
import { INTAKE_FIELD_BY_KEY } from "@shared/intakeFormRegistry";
import type { CustomFieldDefinition } from "@shared/schema";
import { parseFieldRules, evaluateFieldRule } from "@shared/lib/workflowFieldRules";
import {
  parseThresholdConfig,
  evaluateThreshold,
  coerceNumeric,
  formatThresholdExpression,
} from "@shared/lib/thresholdCheck";

export type WorkflowEntityType = "intake" | "project";

interface StepInfo {
  stepKey: string;
  label: string;
  helpText?: string | null;
  description?: string | null;
  requiredFields?: string[] | null;
  // Per-field value-based gate rules. Shape:
  // { [fieldKey]: { allowedValues: string[] } } — see
  // shared/lib/workflowFieldRules.ts for full semantics.
  fieldRules?: unknown;
  // Intake-only: governance Y/N questionnaires are only enforced when the
  // current step has these toggles enabled.
  showArchitectureQuestions?: boolean | null;
  showCybersecurityQuestions?: boolean | null;
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

// Returns true if the given built-in intake/project field key is numeric. Used
// to detect Drizzle-string "0" values that should count as empty for required
// gates. Source of truth: the form registries' `inputType` metadata.
function isNumericBuiltinField(entityType: WorkflowEntityType, key: string): boolean {
  if (entityType === 'project') return PROJECT_FORM_FIELD_BY_KEY[key]?.inputType === 'number';
  return INTAKE_FIELD_BY_KEY[key]?.inputType === 'number';
}

function getEntityEndpoint(t: WorkflowEntityType, id: number) {
  return t === "intake" ? `/api/project-intakes/${id}` : `/api/projects/${id}`;
}

function getEntityQueryKey(t: WorkflowEntityType, id: number) {
  return t === "intake" ? ['/api/project-intakes', id] : ['/api/projects', id];
}

// Keys to invalidate after a write so all consumers (page, list, badges) refetch.
function getEntityInvalidationKeys(t: WorkflowEntityType, id: number): unknown[][] {
  if (t === "intake") {
    return [
      ['/api/project-intakes', id],
      ['/api/project-intakes'],
    ];
  }
  // ProjectDetails uses the api-spec path literal (`/api/projects/:id`) as its
  // query key prefix, while other places key off `/api/projects`. Invalidate
  // both so the workflow ribbon refetches after a Save & Advance.
  return [
    ['/api/projects/:id', id],
    ['/api/projects', id],
    ['/api/projects'],
  ];
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
  const { data: orgResources = [] } = useResources(organizationId);
  const { data: projectLayout = [] } = useProjectFormLayout(
    open && entityType === 'project' ? organizationId : undefined,
  );
  const { data: intakeLayout = [] } = useIntakeTabLayout(
    open && entityType === 'intake' ? organizationId : undefined,
  );
  const cfDefs = useMemo(() => allCfDefs.filter(d => {
    const et = d.entityType || 'project';
    return et === 'project' || et === 'intake';
  }), [allCfDefs]);

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
        const ft = f.customDef?.fieldType;
        // Computed Pass/Fail field — value isn't stored; "satisfied" means the
        // configured threshold passes against the current source field value.
        if (ft === 'threshold_check' && f.customDef) {
          const cfg = parseThresholdConfig(f.customDef.options as string[] | null | undefined);
          if (!cfg) { errs.push(`${f.label} is not configured`); continue; }
          const sourceRaw = cfValues.find(cv => cv.fieldDefinitionId === cfg.sourceFieldId)?.value;
          const sourceNum = coerceNumeric(sourceRaw);
          if (sourceNum == null || !evaluateThreshold(sourceNum, cfg.operator, cfg.threshold)) {
            errs.push(`${f.label} must pass its threshold`);
          }
          continue;
        }
        const trimmed = (v ?? "").toString().trim();
        const empty = trimmed.length === 0
          || (ft === 'checkbox' && trimmed !== 'true')
          || (ft === 'multiselect' && (trimmed === '[]' || trimmed === 'null'))
          || (ft === 'number' && Number(trimmed) <= 0);
        if (empty) errs.push(`${f.label} is required`);
      } else {
        const isNumberField = isNumericBuiltinField(entityType, f.key);
        if (v == null) { errs.push(`${f.label} is required`); continue; }
        if (typeof v === 'string' && !v.trim()) errs.push(`${f.label} is required`);
        else if (typeof v === 'number' && v <= 0) errs.push(`${f.label} is required`);
        else if (isNumberField && typeof v === 'string' && Number(v) <= 0) errs.push(`${f.label} is required`);
      }
    }
    return errs;
  }, [draft, fields]);

  // Validate ALL required fields placed anywhere on the configured form tabs
  // (project Summary tabs / intake tabs) — not just those listed in this gate's
  // requiredFields. Required-ness comes from the per-item `isRequired` toggle
  // configured in the form layout editor, OR-ed with the custom field
  // definition's own `isRequired` flag for custom fields.
  const layoutValidationErrors = useMemo<string[]>(() => {
    if (!entity) return [];
    const stepKeys = new Set((step.requiredFields || []) as string[]);
    const tabs = entityType === 'project' ? projectLayout : intakeLayout;
    if (!tabs || tabs.length === 0) return [];

    const errs: string[] = [];
    const seen = new Set<string>();

    for (const tab of tabs) {
      if (tab.isActive === false) continue;
      for (const section of tab.sections || []) {
        for (const item of section.items || []) {
          if (item.itemType === 'block') continue;
          if (item.itemType === 'label') continue;

          if (item.itemType === 'custom_field') {
            const id = Number(item.itemKey);
            if (!Number.isFinite(id)) continue;
            const def = cfDefs.find(d => d.id === id);
            if (!def) continue;
            const required = !!(item as any).isRequired || !!def.isRequired;
            if (!required) continue;
            const cfKey = `cf:${id}`;
            if (stepKeys.has(cfKey) || seen.has(cfKey)) continue;
            seen.add(cfKey);
            const ft = def.fieldType;
            if (ft === 'threshold_check') {
              // Same treatment as the per-step validator: required = the
              // configured threshold passes against the current source value.
              const cfg = parseThresholdConfig(def.options as string[] | null | undefined);
              if (!cfg) {
                errs.push(`${item.displayName || def.name} is not configured (${tab.label})`);
                continue;
              }
              const srcRaw = cfValues.find(cv => cv.fieldDefinitionId === cfg.sourceFieldId)?.value;
              const srcNum = coerceNumeric(srcRaw);
              if (srcNum == null || !evaluateThreshold(srcNum, cfg.operator, cfg.threshold)) {
                errs.push(`${item.displayName || def.name} must pass its threshold (${tab.label})`);
              }
              continue;
            }
            const raw = cfValues.find(cv => cv.fieldDefinitionId === id)?.value ?? '';
            const trimmed = String(raw ?? '').trim();
            const empty = trimmed.length === 0
              || (ft === 'checkbox' && trimmed !== 'true')
              || (ft === 'multiselect' && (trimmed === '[]' || trimmed === 'null'))
              || (ft === 'number' && Number(trimmed) <= 0);
            if (empty) {
              errs.push(`${item.displayName || def.name} is required (${tab.label})`);
            }
            continue;
          }

          // itemType === 'field'
          // Project layout items don't have a per-item isRequired column yet,
          // so keep the legacy fallback set so `name` is still enforced. Intake
          // items use the per-item toggle exclusively.
          const PROJECT_BUILTIN_REQUIRED = new Set(['name']);
          const fieldRequired = !!(item as any).isRequired
            || (entityType === 'project' && PROJECT_BUILTIN_REQUIRED.has(item.itemKey));
          if (!fieldRequired) continue;
          const key = item.itemKey;
          if (stepKeys.has(key) || seen.has(key)) continue;
          seen.add(key);
          const v = (entity as any)[key];
          const isNumberField = isNumericBuiltinField(entityType, key);
          const empty = v == null
            || (typeof v === 'string' && !v.trim())
            || (typeof v === 'number' && v <= 0)
            || (isNumberField && typeof v === 'string' && Number(v) <= 0);
          if (empty) {
            const label = item.displayName
              || (entityType === 'project' ? PROJECT_FORM_FIELD_BY_KEY[key]?.label : builtinIntakeField(key)?.label)
              || key;
            errs.push(`${label} is required (${tab.label})`);
          }
        }
      }
    }
    return errs;
  }, [entity, entityType, projectLayout, intakeLayout, cfDefs, cfValues, step.requiredFields]);

  // Governance Y/N questionnaires (intake only). Once seeded for an intake,
  // every row must have answer === 'yes' or 'no' before the user can advance.
  // If the questionnaire was never seeded (list is empty) we don't enforce —
  // matches the lazy-seed model in IntakeDetails.
  // Only fetch / enforce governance answers when the *current* step actually
  // shows that questionnaire — otherwise advancing from an unrelated step
  // would falsely block on questions the user isn't expected to fill in here.
  const archEnabled = entityType === 'intake' && open && step.showArchitectureQuestions === true;
  const cyberEnabled = entityType === 'intake' && open && step.showCybersecurityQuestions === true;
  const archQuestionsQ = useIntakeGovernanceQuestions(
    archEnabled ? entityId : 0,
    'architecture',
  );
  const cyberQuestionsQ = useIntakeGovernanceQuestions(
    cyberEnabled ? entityId : 0,
    'cybersecurity',
  );
  const governanceValidationErrors = useMemo<string[]>(() => {
    if (entityType !== 'intake') return [];
    const errs: string[] = [];
    if (archEnabled) {
      const arch = archQuestionsQ.data || [];
      const archUnanswered = arch.filter(q => q.answer !== 'yes' && q.answer !== 'no').length;
      if (archUnanswered > 0) {
        errs.push(`${archUnanswered} Architecture question${archUnanswered === 1 ? '' : 's'} unanswered`);
      }
    }
    if (cyberEnabled) {
      const cyber = cyberQuestionsQ.data || [];
      const cyberUnanswered = cyber.filter(q => q.answer !== 'yes' && q.answer !== 'no').length;
      if (cyberUnanswered > 0) {
        errs.push(`${cyberUnanswered} Cybersecurity question${cyberUnanswered === 1 ? '' : 's'} unanswered`);
      }
    }
    return errs;
  }, [entityType, archEnabled, cyberEnabled, archQuestionsQ.data, cyberQuestionsQ.data]);

  // Value-based gate rules ("field must be one of these allowed values").
  // Evaluated against the current draft so the user sees the error update
  // live as they change the value in the dialog.
  const ruleValidationErrors = useMemo<string[]>(() => {
    const rules = parseFieldRules(step.fieldRules);
    const keys = Object.keys(rules);
    if (keys.length === 0) return [];
    const errs: string[] = [];
    for (const key of keys) {
      const rule = rules[key];
      let label = key;
      let value: unknown;
      if (key.startsWith('cf:')) {
        const id = Number(key.slice(3));
        const def = cfDefs.find(d => d.id === id);
        label = def?.name || key;
        // Prefer draft (in-dialog edit) over the persisted cf value.
        if (key in draft) value = draft[key];
        else value = cfValues.find(cv => cv.fieldDefinitionId === id)?.value ?? '';
      } else {
        if (entityType === 'project') {
          label = PROJECT_FORM_FIELD_BY_KEY[key]?.label || key;
        } else {
          label = builtinIntakeField(key)?.label || key;
        }
        if (key in draft) value = draft[key];
        else value = (entity as any)?.[key];
      }
      const err = evaluateFieldRule(key, rule, label, value);
      if (err) errs.push(err.message);
    }
    return errs;
  }, [draft, entity, entityType, cfDefs, cfValues, step.fieldRules]);

  const allValidationErrors = useMemo(
    () => [...validationErrors, ...layoutValidationErrors, ...governanceValidationErrors, ...ruleValidationErrors],
    [validationErrors, layoutValidationErrors, governanceValidationErrors, ruleValidationErrors],
  );

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
    for (const key of getEntityInvalidationKeys(entityType, entityId)) {
      queryClient.invalidateQueries({ queryKey: key });
    }
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
    if (allValidationErrors.length > 0) {
      toast({ title: "Gate requirements not met", description: allValidationErrors.join('; '), variant: "destructive" });
      return;
    }
    if (!nextStep) return;
    setIsSaving(true);
    try {
      await persist();
      const advanceField = entityType === 'intake' ? 'currentStep' : 'status';
      await apiRequest('PUT', getEntityEndpoint(entityType, entityId), { [advanceField]: nextStep.stepKey });
      for (const key of getEntityInvalidationKeys(entityType, entityId)) {
        queryClient.invalidateQueries({ queryKey: key });
      }
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
    const disabled = isLocked || isSaving || !isCurrentStep;

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
        case 'resource': {
          const active = orgResources.filter(r => r.isActive);
          const current = String(v ?? "");
          return (
            <Select
              value={current || undefined}
              onValueChange={(val) => set(val === "__clear__" ? "" : val)}
              disabled={disabled}
            >
              <SelectTrigger data-testid={`wsd-input-${f.key}`}>
                <SelectValue placeholder="Select resource..." />
              </SelectTrigger>
              <SelectContent>
                {current && <SelectItem value="__clear__">Clear selection</SelectItem>}
                {active.map(r => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        case 'autonumber':
          return <Input value={String(v)} disabled readOnly placeholder="Auto-assigned on save" data-testid={`wsd-input-${f.key}`} />;
        case 'threshold_check': {
          // Computed Pass/Fail — read-only here. Reflects whether the
          // configured source field currently meets the configured threshold.
          const cfg = parseThresholdConfig(def.options as string[] | null | undefined);
          if (!cfg) {
            return (
              <span className="text-muted-foreground text-sm italic" data-testid={`wsd-input-${f.key}`}>
                Not configured
              </span>
            );
          }
          const source = cfDefs.find(d => d.id === cfg.sourceFieldId);
          const sourceRaw = cfValues.find(cv => cv.fieldDefinitionId === cfg.sourceFieldId)?.value;
          const sourceNum = coerceNumeric(sourceRaw);
          const expr = source ? formatThresholdExpression(source.name, cfg.operator, cfg.threshold) : "source field missing";
          if (sourceNum == null) {
            return (
              <span className="text-muted-foreground text-sm" data-testid={`wsd-input-${f.key}`} title={`Pass when ${expr}`}>
                — (waiting for {source?.name || "source field"})
              </span>
            );
          }
          const passed = evaluateThreshold(sourceNum, cfg.operator, cfg.threshold);
          const cls = passed
            ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200"
            : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200";
          return (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
              data-testid={`wsd-input-${f.key}`}
              title={`Pass when ${expr} · current value ${sourceNum}`}
            >
              {passed ? "Pass" : "Fail"}
            </span>
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

    // Intake built-in: use the full registry (INTAKE_FIELD_BY_KEY) for
    // inputType / options / placeholder so select fields (e.g. businessUnit,
    // fundingSource) actually render as dropdowns instead of free text.
    const idef = INTAKE_FIELD_BY_KEY[f.key];
    const iit = idef?.inputType || 'text';
    switch (iit) {
      case 'textarea':
        return <Textarea value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} rows={idef?.rows || 3} placeholder={idef?.placeholder} className="resize-none" data-testid={`wsd-input-${f.key}`} />;
      case 'number':
        return <Input type="number" value={String(v)} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} disabled={disabled} data-testid={`wsd-input-${f.key}`} />;
      case 'select': {
        const options = idef?.options || [];
        return (
          <Select value={String(v)} onValueChange={set} disabled={disabled}>
            <SelectTrigger data-testid={`wsd-input-${f.key}`}><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        );
      }
      case 'resource': {
        const active = orgResources.filter(r => r.isActive);
        const currentVal = v === null || v === undefined || v === "" ? "" : String(v);
        return (
          <Select
            value={currentVal || undefined}
            onValueChange={(val) => set(val === "__clear__" ? null : Number(val))}
            disabled={disabled}
          >
            <SelectTrigger data-testid={`wsd-input-${f.key}`}>
              <SelectValue placeholder="Select resource..." />
            </SelectTrigger>
            <SelectContent>
              {currentVal && <SelectItem value="__clear__">Clear selection</SelectItem>}
              {active.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      default: {
        // Fallback to the previous text/textarea heuristic for keys not in
        // the rich registry (kept so legacy keys keep their old shape).
        const longish = ['description', 'businessProblem', 'desiredOutcome', 'financialJustification', 'resourceRequirements', 'cyberRiskAssessment'].includes(f.key);
        return longish
          ? <Textarea value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} rows={3} className="resize-none" data-testid={`wsd-input-${f.key}`} />
          : <Input value={String(v)} onChange={e => set(e.target.value)} disabled={disabled} placeholder={idef?.placeholder} data-testid={`wsd-input-${f.key}`} />;
      }
    }
  };

  const canAdvance = isCurrentStep && !!nextStep && !isLocked && allValidationErrors.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" data-testid="workflow-step-dialog">
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
        ) : (
          <div className="space-y-4 py-2">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No step-specific required fields are configured. Use Settings → Governance → Project Workflow to define what users must complete here.
              </p>
            ) : (
              fields.map(f => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`wsd-${f.key}`} className="flex items-center gap-1.5">
                    <span>{f.label}</span>
                    {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  {renderInput(f)}
                </div>
              ))
            )}
            {allValidationErrors.length > 0 && isCurrentStep && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">Required before advancing:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    {allValidationErrors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} data-testid="wsd-button-cancel">
            Close
          </Button>
          {!isLocked && fields.length > 0 && isCurrentStep && (
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
              title={!canAdvance && allValidationErrors.length > 0 ? "Complete required fields first" : `Save & Advance to ${nextStep.label}`}
              className="whitespace-normal text-left h-auto py-2 min-w-0 max-w-full"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1 shrink-0" />}
              <span className="truncate">Save &amp; Advance to {nextStep.label}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
