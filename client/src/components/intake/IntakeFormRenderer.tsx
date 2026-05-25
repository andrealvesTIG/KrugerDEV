import { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Check, Gavel, Lightbulb, FileText, Calculator, Shield, MessageSquare, ListChecks, ClipboardList, DollarSign, Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectIntake, Portfolio, Program, Resource } from "@shared/schema";
import type { IntakeTabLayoutTabFull, IntakeTabLayoutSectionFull, IntakeTabLayoutItemFull } from "@/hooks/use-intake-tab-layout";
import { IntakeFieldRenderer } from "./IntakeFieldRenderer";
import { IntakeFinancialsSection } from "./IntakeFinancialsSection";
import { IntakeGovernanceQuestionsSection } from "./IntakeGovernanceQuestionsSection";
import { IntakeCostingChecklistSection } from "./IntakeCostingChecklistSection";
import { IntakeSingleCustomField } from "./IntakeSingleCustomField";

const ICONS: Record<string, LucideIcon> = {
  Lightbulb, FileText, Calculator, Shield, MessageSquare, ListChecks, ClipboardList, DollarSign, Settings: SettingsIcon, Gavel,
};

const REQUIRED_FIELD_KEYS = new Set([
  "projectName", "description",
  "estimatedBudget", "financialJustification",
  "itCostEstimate", "resourceRequirements",
  "cyberRiskAssessment",
]);

const WIDTH_CLASS: Record<string, string> = {
  full: "col-span-12",
  half: "col-span-12 md:col-span-6",
  third: "col-span-12 md:col-span-4",
};

export interface IntakeFormRendererContext {
  intake: ProjectIntake;
  formData: Partial<ProjectIntake>;
  onFieldChange: (field: string, value: any) => void;
  /**
   * Optional autosave hook fired by IntakeFieldRenderer on blur (text /
   * textarea / number) and on change (select / checkbox / pickers). Wired in
   * IntakeDetails to persist the single changed field so other surfaces
   * (e.g. the workflow step requirements dialog) reflect the latest value
   * without a manual Save.
   */
  onFieldCommit?: (field: string, value: any) => void;
  isLocked: boolean;
  portfolios: Portfolio[];
  programs: Program[];
  resources: Resource[];
  organizationId: number | undefined;
  canApproveIntakes: boolean;
  onPmoApprovedChange: (value: boolean) => void;
  // Per-step gating flags (existing behavior preserved for grid/questionnaire blocks)
  showFinancialsForCurrentStep: boolean;
  showArchitectureForCurrentStep: boolean;
  showCybersecurityForCurrentStep: boolean;
  showCostingChecklistForCurrentStep: boolean;
  // True when the intake's current workflow step has the "Requires PM
  // approval" toggle on. Replaces the legacy `pm_approval` layout block.
  requiresPmApprovalForCurrentStep: boolean;
  // Source panel renderer (kept inside parent file for now to avoid moving the component)
  renderSourcePanel: () => ReactNode;
  renderCustomFieldsBlock: (excludeDefinitionIds: number[]) => ReactNode;
  // Field keys (and `cf:<defId>` for custom fields) that the current workflow
  // step marks as required. Drives the red-asterisk mandatory indicator on
  // the form even before the user tries to advance the gate.
  currentStepRequiredFields?: string[];
}

export interface IntakeFormRendererProps {
  layout: IntakeTabLayoutTabFull[];
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  ctx: IntakeFormRendererContext;
}

/**
 * Standalone PM Approval card. Rendered from IntakeDetails when the current
 * workflow step has `requiresPmApproval = true` and the viewer can approve
 * intakes. Decouples approval from the form layout so admins control it on
 * the workflow itself, not by placing a block on a tab.
 */
export function PmApprovalCard({ ctx }: { ctx: IntakeFormRendererContext }) {
  if (!ctx.canApproveIntakes) return null;
  if (!ctx.requiresPmApprovalForCurrentStep) return null;
  const approved = ctx.formData.pmoApproved ?? ctx.intake.pmoApproved;
  return (
    <Card className="border-primary/20" data-testid="card-pm-approval">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-primary" />
          PM Approval
        </CardTitle>
        <CardDescription>PM approval is required before this intake can be converted to a project</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 p-4 rounded-md bg-muted/50">
          <Checkbox
            id="pmoApproved"
            checked={approved ?? false}
            onCheckedChange={(checked) => ctx.onPmoApprovedChange(!!checked)}
            disabled={ctx.isLocked}
            data-testid="checkbox-pmo-approved"
          />
          <Label htmlFor="pmoApproved" className="text-sm cursor-pointer font-medium">
            PM has reviewed and approved this intake for project conversion
          </Label>
        </div>
        {approved && (
          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
            <Check className="h-4 w-4" />
            PM approval granted. This intake is ready for conversion by an admin.
          </p>
        )}
        {!approved && !ctx.isLocked && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            PM approval is required before the "Approve &amp; Convert" button can be used.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function isItemVisibleForCurrentStep(item: IntakeTabLayoutItemFull, ctx: IntakeFormRendererContext): boolean {
  if (item.itemType === "label") return true;
  if (item.itemType !== "block") return true;
  switch (item.itemKey) {
    case "financials_grid":         return ctx.showFinancialsForCurrentStep;
    case "architecture_questions":  return ctx.showArchitectureForCurrentStep;
    case "cybersecurity_questions": return ctx.showCybersecurityForCurrentStep;
    case "costing_checklist":       return ctx.showCostingChecklistForCurrentStep;
    // The legacy `pm_approval` layout block is deprecated for new layouts
    // (removed from the picker/defaults). For existing layouts that still
    // include it, render it only when the current workflow step requires
    // PM approval. IntakeDetails detects this block in the saved layout
    // and suppresses the standalone <PmApprovalCard /> so we don't
    // double-render.
    case "pm_approval":             return ctx.requiresPmApprovalForCurrentStep;
    default:                        return true;
  }
}

function MissingRefPlaceholder({ kind, itemKey }: { kind: string; itemKey: string }) {
  return (
    <div
      title={`Admin: layout references a missing ${kind} (${itemKey}). Clean it up in Settings → Governance → Intake Form.`}
      className="w-full min-h-[3.25rem] rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center"
      data-testid="intake-form-missing-ref"
    >
      <span className="opacity-60">Missing {kind} placeholder</span>
    </div>
  );
}

const isSectionVisibleForCurrentStep = (section: IntakeTabLayoutSectionFull, ctx: IntakeFormRendererContext) =>
  section.items.some(item => isItemVisibleForCurrentStep(item, ctx));

const isTabVisibleForCurrentStep = (tab: IntakeTabLayoutTabFull, ctx: IntakeFormRendererContext) =>
  tab.sections.some(section => isSectionVisibleForCurrentStep(section, ctx));

export function IntakeFormRenderer({ layout, activeTab, onActiveTabChange, ctx }: IntakeFormRendererProps) {
  const visibleTabs = layout
    .filter(t => t.isActive)
    .filter(t => isTabVisibleForCurrentStep(t, ctx));
  if (visibleTabs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No intake form tabs are configured. Ask an admin to configure the intake form layout in Settings.
        </CardContent>
      </Card>
    );
  }
  const safeActive = visibleTabs.find(t => t.key === activeTab) ? activeTab : visibleTabs[0].key;
  const placedIds: number[] = [];
  for (const t of visibleTabs) for (const s of t.sections) for (const i of s.items) {
    if (i.itemType === "custom_field") {
      const n = Number(i.itemKey);
      if (Number.isFinite(n)) placedIds.push(n);
    }
  }
  return (
    <Tabs value={safeActive} onValueChange={onActiveTabChange} className="space-y-4">
      <TabsList className="flex w-full flex-wrap h-auto gap-1 justify-start">
        {visibleTabs.map(tab => {
          const Icon = (tab.icon && ICONS[tab.icon]) || Lightbulb;
          return (
            <TabsTrigger key={tab.key} value={tab.key} data-testid={`tab-${tab.key}`}>
              <Icon className="h-4 w-4 mr-1 sm:mr-2" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {visibleTabs.map(tab => (
        <TabsContent key={tab.key} value={tab.key} className="space-y-4">
          {tab.sections.filter(s => isSectionVisibleForCurrentStep(s, ctx)).map(section => (
            <SectionRenderer key={section.id} section={section} ctx={ctx} placedCustomFieldIds={placedIds} />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function SectionRenderer({ section, ctx, placedCustomFieldIds }: { section: IntakeTabLayoutSectionFull; ctx: IntakeFormRendererContext; placedCustomFieldIds: number[] }) {
  // If the section contains exactly one block of type "financials_grid" / questionnaire / source_conversation,
  // render the block bare without the surrounding card to preserve existing visuals.
  const onlyBlock = section.items.length === 1 && section.items[0].itemType === "block" ? section.items[0] : null;
  if (onlyBlock && (onlyBlock.itemKey === "financials_grid" || onlyBlock.itemKey === "architecture_questions" || onlyBlock.itemKey === "cybersecurity_questions" || onlyBlock.itemKey === "costing_checklist" || onlyBlock.itemKey === "source_conversation" || onlyBlock.itemKey === "pm_approval")) {
    return <ItemRenderer item={onlyBlock} ctx={ctx} placedCustomFieldIds={placedCustomFieldIds} bare />;
  }
  const hasHeader = !!(section.title && section.title.trim()) || !!section.description;
  return (
    <Card data-testid={`intake-section-${section.id}`}>
      {hasHeader && (
        <CardHeader>
          {section.title && section.title.trim() && <CardTitle>{section.title}</CardTitle>}
          {section.description && <CardDescription>{section.description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className={cn("space-y-4", !hasHeader && "pt-6")}>
        <div className="grid grid-cols-12 gap-4">
          {section.items.map(item => (
            <div key={item.id} className={WIDTH_CLASS[item.width] ?? WIDTH_CLASS.full}>
              <ItemRenderer item={item} ctx={ctx} placedCustomFieldIds={placedCustomFieldIds} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ItemRenderer({ item, ctx, placedCustomFieldIds, bare }: { item: IntakeTabLayoutItemFull; ctx: IntakeFormRendererContext; placedCustomFieldIds: number[]; bare?: boolean }) {
  if (item.itemType === "field") {
    const requiredByStep = ctx.currentStepRequiredFields?.includes(item.itemKey) ?? false;
    return (
      <IntakeFieldRenderer
        fieldKey={item.itemKey}
        intake={ctx.intake}
        formData={ctx.formData}
        onChange={ctx.onFieldChange}
        onCommit={ctx.onFieldCommit}
        isLocked={ctx.isLocked}
        portfolios={ctx.portfolios}
        programs={ctx.programs}
        resources={ctx.resources}
        isRequired={REQUIRED_FIELD_KEYS.has(item.itemKey) || requiredByStep}
        labelOverride={item.displayName}
      />
    );
  }
  if (item.itemType === "custom_field") {
    const defId = Number(item.itemKey);
    if (!Number.isFinite(defId)) {
      return <MissingRefPlaceholder kind="custom field" itemKey={item.itemKey} />;
    }
    const requiredByStep = ctx.currentStepRequiredFields?.includes(`cf:${defId}`) ?? false;
    return (
      <IntakeSingleCustomField
        intakeId={ctx.intake.id}
        organizationId={ctx.organizationId}
        definitionId={defId}
        isLocked={ctx.isLocked}
        intake={ctx.intake}
        labelOverride={item.displayName}
        isRequiredOverride={requiredByStep}
      />
    );
  }
  if (item.itemType === "label") {
    return <LabelItemRenderer text={item.displayName} />;
  }
  return <BlockRenderer blockKey={item.itemKey} ctx={ctx} placedCustomFieldIds={placedCustomFieldIds} bare={bare} />;
}

function LabelItemRenderer({ text }: { text: string | null | undefined }) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  return (
    <div
      className="text-sm text-foreground whitespace-pre-wrap leading-relaxed py-1"
      data-testid="intake-layout-label"
    >
      {trimmed}
    </div>
  );
}

function BlockRenderer({ blockKey, ctx, placedCustomFieldIds, bare }: { blockKey: string; ctx: IntakeFormRendererContext; placedCustomFieldIds: number[]; bare?: boolean }) {
  switch (blockKey) {
    case "custom_fields":
      return <>{ctx.renderCustomFieldsBlock(placedCustomFieldIds)}</>;
    case "budget_summary": {
      const budget = parseFloat(String(ctx.formData.estimatedBudget ?? ctx.intake.estimatedBudget ?? 0)) || 0;
      const capEx = parseFloat(String(ctx.formData.capitalExpense ?? ctx.intake.capitalExpense ?? 0)) || 0;
      const opEx = parseFloat(String(ctx.formData.operatingExpense ?? ctx.intake.operatingExpense ?? 0)) || 0;
      const remaining = budget - capEx - opEx;
      if (!(budget > 0 && (capEx > 0 || opEx > 0))) return null;
      if (remaining < 0) {
        return (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid="block-budget-summary-over">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              CapEx + OpEx exceeds the Estimated Total Budget by {formatCurrency(Math.abs(remaining))}. Please adjust the values before saving.
            </p>
          </div>
        );
      }
      return <p className="text-xs text-muted-foreground" data-testid="block-budget-summary-remaining">Remaining budget: {formatCurrency(remaining)}</p>;
    }
    case "financials_grid":
      if (!ctx.showFinancialsForCurrentStep) return null;
      return <IntakeFinancialsSection intakeId={ctx.intake.id} readOnly={ctx.isLocked} />;
    case "architecture_questions":
      if (!ctx.showArchitectureForCurrentStep) return null;
      return <IntakeGovernanceQuestionsSection intakeId={ctx.intake.id} category="architecture" readOnly={ctx.isLocked} />;
    case "cybersecurity_questions":
      if (!ctx.showCybersecurityForCurrentStep) return null;
      return <IntakeGovernanceQuestionsSection intakeId={ctx.intake.id} category="cybersecurity" readOnly={ctx.isLocked} />;
    case "costing_checklist":
      if (!ctx.showCostingChecklistForCurrentStep) return null;
      return <IntakeCostingChecklistSection intakeId={ctx.intake.id} readOnly={ctx.isLocked} />;
    case "source_conversation":
      return <>{ctx.renderSourcePanel()}</>;
    case "pm_approval":
      // Legacy block kept for backward compatibility with saved layouts.
      // Renders the same card as the standalone <PmApprovalCard />.
      // Visibility is already gated by isItemVisibleForCurrentStep, which
      // checks ctx.requiresPmApprovalForCurrentStep.
      return <PmApprovalCard ctx={ctx} />;
    default:
      return <MissingRefPlaceholder kind="block" itemKey={blockKey} />;
  }
}
