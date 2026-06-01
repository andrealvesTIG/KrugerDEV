import { useState } from "react";
import { format } from "date-fns";
import { isCustomFieldEffectivelyRequired } from "@shared/lib/conditionalRequired";
import { Check, X, ExternalLink, Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { useCustomFieldDefinitions, useIntakeCustomFieldValues, useUpdateIntakeCustomFieldValue } from "@/hooks/use-custom-fields";
import { useResources } from "@/hooks/use-resources";
import { useIntakeFinancials } from "@/hooks/use-intake-financials";
import { formatCurrency } from "@/lib/format";
import { AttachmentFieldInput, AttachmentFieldDisplay } from "@/components/custom-fields/AttachmentField";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { computeRoi, formatRoiPercent } from "@shared/lib/roi";
import { computeWorstRag } from "@shared/lib/ragRollup";
import { parseThresholdConfig, evaluateThreshold, formatThresholdExpression } from "@shared/lib/thresholdCheck";
import { resolveSourceNumericValue } from "@shared/lib/computedSourceValue";
import { evaluateFormula } from "@shared/lib/formula";
import { findDatePairOrderError } from "@shared/lib/customFieldDateValidation";
import type { CustomFieldDefinition } from "@shared/schema";

export function IntakeSingleCustomField({
  intakeId,
  organizationId,
  definitionId,
  isLocked,
  intake,
  labelOverride,
  isRequiredOverride,
}: {
  intakeId: number;
  organizationId: number | undefined;
  definitionId: number;
  isLocked: boolean;
  // The intake row, when available, lets us compute fields like ROI from
  // `estimatedBudget` and `expectedBenefits` without an extra fetch.
  intake?: { estimatedBudget?: string | number | null; expectedBenefits?: string | number | null } | null;
  labelOverride?: string | null;
  isRequiredOverride?: boolean;
}) {
  const { toast } = useToast();
  const { data: allDefinitions = [], isLoading: defsLoading } = useCustomFieldDefinitions(organizationId);
  const { data: values = [], isLoading: valsLoading } = useIntakeCustomFieldValues(intakeId);
  const { data: orgResources = [] } = useResources(organizationId ?? null);
  const { data: intakeFinancials = [] } = useIntakeFinancials(intakeId);
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

  const isComputed = field.fieldType === "days_between_dates"
    || field.fieldType === "roi"
    || field.fieldType === "rag_rollup"
    || field.fieldType === "threshold_check"
    || field.fieldType === "formula"
    || field.fieldType === "rollup";
  const startEdit = () => {
    if (isLocked || field.fieldType === "autonumber" || isComputed) return;
    setEditValue(value);
    setIsEditing(true);
  };
  const closeEdit = () => { setIsEditing(false); setEditValue(""); };
  const save = async () => {
    const normalized = editValue || null;
    const previous = value || null;
    if (normalized === previous) {
      closeEdit();
      return;
    }
    if (field.fieldType === "date") {
      const err = findDatePairOrderError(allDefinitions, values, field.id, normalized);
      if (err) {
        toast({ title: "Invalid date", description: err, variant: "destructive" });
        return;
      }
    }
    try {
      await updateValue.mutateAsync({ intakeId, fieldDefinitionId: definitionId, value: normalized });
      toast({ title: "Saved" });
      setIsEditing(false);
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };
  const commitsOnChange = field.fieldType === "select" || field.fieldType === "resource" || field.fieldType === "attachment";
  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (commitsOnChange) return;
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (related && related.closest('[data-radix-popper-content-wrapper],[data-radix-portal],[role="listbox"],[role="dialog"]')) return;
    if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
    save();
  };
  const commitImmediate = async (next: string) => {
    const normalized = next || null;
    const previous = value || null;
    if (normalized === previous) { closeEdit(); return; }
    try {
      await updateValue.mutateAsync({ intakeId, fieldDefinitionId: definitionId, value: normalized });
      toast({ title: "Saved" });
      setIsEditing(false);
      setEditValue("");
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };
  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); closeEdit(); }
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
            onValueChange={(v) => { setEditValue(v); commitImmediate(v); }}
            placeholder="Select..."
            options={(field.options as string[] || []).map(o => ({ value: o, label: o }))}
            testId={`select-intake-cf-${field.id}`}
          />
        );
      case "resource":
        return (
          <SearchableSelect
            value={editValue}
            onValueChange={(v) => { setEditValue(v); commitImmediate(v); }}
            placeholder="Select resource..."
            options={orgResources.map(r => ({ value: String(r.id), label: r.displayName }))}
            testId={`select-intake-cf-resource-${field.id}`}
          />
        );
      case "attachment":
        return <AttachmentFieldInput value={editValue} onChange={(v) => { setEditValue(v); commitImmediate(v); }} testId={`attachment-intake-cf-${field.id}`} />;
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
      case "percentage":
        return (
          <div className="relative w-full">
            <Input
              type="number"
              step="0.01"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="pr-7"
              data-testid={`input-intake-cf-${field.id}`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        );
      case "url":
        return <Input type="url" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="https://..." data-testid={`input-intake-cf-${field.id}`} />;
      case "conditional":
        return <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-cf-${field.id}`} />;
      default:
        return (
          <AutoResizeTextarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            minRows={2}
            data-testid={`input-intake-cf-${field.id}`}
          />
        );
    }
  };

  const renderValue = () => {
    if (field.fieldType === "days_between_dates") {
      const opts = Array.isArray(field.options) ? (field.options as string[]) : [];
      const startId = parseInt(opts[0] ?? "", 10);
      const endId = parseInt(opts[1] ?? "", 10);
      if (!startId || !endId) {
        return <span className="text-muted-foreground text-sm" data-testid={`value-intake-computed-empty-${field.id}`}>—</span>;
      }
      const sv = values.find(v => v.fieldDefinitionId === startId)?.value;
      const ev = values.find(v => v.fieldDefinitionId === endId)?.value;
      if (!sv || !ev) return <span className="text-muted-foreground text-sm" data-testid={`value-intake-computed-empty-${field.id}`}>—</span>;
      const s = new Date(sv);
      const e = new Date(ev);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        return <span className="text-muted-foreground text-sm" data-testid={`value-intake-computed-empty-${field.id}`}>—</span>;
      }
      const days = Math.round((e.getTime() - s.getTime()) / 86_400_000);
      return <span className="text-sm" data-testid={`value-intake-computed-${field.id}`}>{days} {days === 1 ? "day" : "days"}</span>;
    }
    if (field.fieldType === "roi") {
      const totalCosts = parseFloat(String(intake?.estimatedBudget ?? 0));
      const totalBenefits = parseFloat(String(intake?.expectedBenefits ?? 0));
      const { roiPercent } = computeRoi({ totalCosts, totalBenefits });
      return (
        <span className="text-sm inline-flex items-center gap-1" data-testid={`value-intake-roi-${field.id}`}>
          {formatRoiPercent(roiPercent)}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" data-testid={`tooltip-intake-roi-${field.id}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <div className="font-medium mb-1">How ROI is calculated</div>
              <div>ROI(%) = ((Benefits − Costs) / Costs) × 100</div>
              <div className="mt-1 text-muted-foreground">
                Costs = Estimated Budget · Benefits = Expected Benefits
              </div>
            </TooltipContent>
          </Tooltip>
        </span>
      );
    }
    if (field.fieldType === "rag_rollup") {
      const opts = Array.isArray(field.options) ? (field.options as string[]) : [];
      const rawSourceIds = opts.map(o => parseInt(o, 10)).filter(n => Number.isFinite(n));
      // Only honour sources that still exist as active RAG fields. Soft-deleted
      // or retyped sources are ignored so the rollup never reflects values the
      // admin can no longer see in the picker.
      const activeSources = rawSourceIds
        .map(id => allDefinitions.find(d => d.id === id))
        .filter((d): d is typeof allDefinitions[number] => !!d && d.fieldType === "rag");
      const sourceValues = activeSources.map(d => values.find(v => v.fieldDefinitionId === d.id)?.value);
      const worst = computeWorstRag(sourceValues);
      const sourceLabels = activeSources.map(d => d.name);
      const tooltipText = sourceLabels.length
        ? `Worst of: ${sourceLabels.join(", ")}`
        : "No source RAG fields configured";
      if (!worst) {
        return (
          <span className="text-muted-foreground text-sm inline-flex items-center gap-1" data-testid={`value-intake-rag-rollup-empty-${field.id}`}>
            —
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{tooltipText}</TooltipContent>
            </Tooltip>
          </span>
        );
      }
      const cls = worst === "Green" ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200"
        : worst === "Yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200"
        : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200";
      const dot = worst === "Green" ? "bg-green-500" : worst === "Yellow" ? "bg-yellow-400" : "bg-red-500";
      return (
        <span className="inline-flex items-center gap-1.5" data-testid={`value-intake-rag-rollup-${field.id}`}>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
            {worst}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" data-testid={`tooltip-intake-rag-rollup-${field.id}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{tooltipText}</TooltipContent>
          </Tooltip>
        </span>
      );
    }
    if (field.fieldType === "threshold_check") {
      const cfg = parseThresholdConfig(field.options as string[] | null | undefined);
      if (!cfg) {
        return (
          <span className="text-muted-foreground text-sm italic" data-testid={`value-intake-threshold-misconfig-${field.id}`}>
            Not configured
          </span>
        );
      }
      const source = allDefinitions.find(d => d.id === cfg.sourceFieldId);
      const sourceNum = resolveSourceNumericValue(cfg.sourceFieldId, {
        definitions: allDefinitions,
        values,
        financials: intakeFinancials,
        entity: intake,
      });
      const tooltipText = source
        ? `Pass when ${formatThresholdExpression(source.name, cfg.operator, cfg.threshold)}`
        : "Source field no longer exists";
      if (sourceNum == null) {
        return (
          <span className="text-muted-foreground text-sm inline-flex items-center gap-1" data-testid={`value-intake-threshold-empty-${field.id}`}>
            —
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{tooltipText}</TooltipContent>
            </Tooltip>
          </span>
        );
      }
      const passed = evaluateThreshold(sourceNum, cfg.operator, cfg.threshold);
      const cls = passed
        ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200"
        : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200";
      return (
        <span className="inline-flex items-center gap-1.5" data-testid={`value-intake-threshold-${field.id}`}>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
            {passed ? "Pass" : "Fail"}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" data-testid={`tooltip-intake-threshold-${field.id}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{tooltipText} · current value {sourceNum}</TooltipContent>
          </Tooltip>
        </span>
      );
    }
    if (field.fieldType === "formula") {
      const expr = Array.isArray(field.options) && (field.options as string[])[0] ? (field.options as string[])[0] : "";
      if (!expr) {
        return (
          <span className="text-muted-foreground text-sm italic" data-testid={`value-intake-formula-misconfig-${field.id}`}>
            Not configured
          </span>
        );
      }
      const result = evaluateFormula(expr, (ref) => {
        const id = parseInt(ref, 10);
        if (!Number.isFinite(id)) return null;
        return values.find(v => v.fieldDefinitionId === id)?.value ?? null;
      });
      if (!result.ok) {
        return (
          <span className="text-destructive text-xs inline-flex items-center gap-1" data-testid={`value-intake-formula-error-${field.id}`}>
            Error
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-destructive hover:opacity-80">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{result.error}</TooltipContent>
            </Tooltip>
          </span>
        );
      }
      const display = typeof result.value === "boolean"
        ? (result.value ? "True" : "False")
        : (Number.isInteger(result.value) ? String(result.value) : Number(result.value).toFixed(2));
      return (
        <span className="text-sm inline-flex items-center gap-1" data-testid={`value-intake-formula-${field.id}`}>
          <span className="font-medium">{display}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" data-testid={`tooltip-intake-formula-${field.id}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-xs">
              <div className="font-medium mb-1">Formula</div>
              <div className="font-mono">{expr}</div>
            </TooltipContent>
          </Tooltip>
        </span>
      );
    }
    if (field.fieldType === "rollup") {
      const opts = Array.isArray(field.options) ? (field.options as string[]) : [];
      const source = opts[0] || "intake_financials";
      const aggregate = opts[1] || "grand_total";
      if (source !== "intake_financials") {
        return (
          <span className="text-muted-foreground text-sm italic" data-testid={`value-intake-rollup-misconfig-${field.id}`}>
            Not configured
          </span>
        );
      }
      const rows = intakeFinancials ?? [];
      let computed: number = 0;
      let display: string = "";
      let tooltipText: string = "";
      const totalCapex = rows.reduce((sum, r) => sum + Number(r.capexAmount || 0), 0);
      const totalOpex = rows.reduce((sum, r) => sum + Number(r.opexAmount || 0), 0);
      switch (aggregate) {
        case "total_capex":
          computed = totalCapex;
          display = formatCurrency(computed);
          tooltipText = `Sum of CapEx across ${rows.length} fiscal year${rows.length === 1 ? "" : "s"} in the Intake Estimates grid`;
          break;
        case "total_opex":
          computed = totalOpex;
          display = formatCurrency(computed);
          tooltipText = `Sum of OpEx across ${rows.length} fiscal year${rows.length === 1 ? "" : "s"} in the Intake Estimates grid`;
          break;
        case "year_count":
          computed = rows.length;
          display = String(rows.length);
          tooltipText = "Number of fiscal year rows in the Intake Estimates grid";
          break;
        case "grand_total":
        default:
          computed = totalCapex + totalOpex;
          display = formatCurrency(computed);
          tooltipText = `CapEx + OpEx across ${rows.length} fiscal year${rows.length === 1 ? "" : "s"} in the Intake Estimates grid`;
          break;
      }
      if (rows.length === 0) {
        return (
          <span className="text-muted-foreground text-sm inline-flex items-center gap-1" data-testid={`value-intake-rollup-empty-${field.id}`}>
            —
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">No rows in the Intake Estimates grid yet</TooltipContent>
            </Tooltip>
          </span>
        );
      }
      return (
        <span className="text-sm inline-flex items-center gap-1" data-testid={`value-intake-rollup-${field.id}`}>
          <span className="font-medium">{display}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" data-testid={`tooltip-intake-rollup-${field.id}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{tooltipText}</TooltipContent>
          </Tooltip>
        </span>
      );
    }
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
      case "percentage": {
        const n = Number(value);
        return <span className="text-sm">{Number.isFinite(n) ? `${n}%` : value}</span>;
      }
      case "resource": {
        const r = orgResources.find(r => String(r.id) === String(value));
        return <span className="text-sm">{r?.displayName ?? "Unknown resource"}</span>;
      }
      default:
        return <span className="text-sm whitespace-pre-wrap break-words">{value}</span>;
    }
  };

  return (
    <div className="space-y-2" data-testid={`intake-single-cf-${field.id}`}>
      <Label className="text-sm flex items-center gap-1">
        {labelOverride && labelOverride.trim() ? labelOverride.trim() : field.name}
        {(isCustomFieldEffectivelyRequired(field, (id) => values.find(v => v.fieldDefinitionId === id)?.value) || isRequiredOverride) && <span className="text-destructive">*</span>}
      </Label>
      {isEditing ? (
        <div
          className="flex items-center gap-2"
          tabIndex={-1}
          onBlur={handleContainerBlur}
          onKeyDown={handleContainerKeyDown}
          data-testid={`edit-intake-cf-${field.id}`}
        >
          {renderInput()}
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          {renderValue()}
          {!isLocked && field.fieldType !== "autonumber" && !isComputed && (
            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={startEdit} data-testid={`button-edit-intake-cf-${field.id}`}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
