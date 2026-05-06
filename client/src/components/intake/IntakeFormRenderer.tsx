import { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Check, Gavel, Lightbulb, FileText, Calculator, Shield, MessageSquare, ListChecks, ClipboardList, DollarSign, Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectIntake, Portfolio } from "@shared/schema";
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
  isLocked: boolean;
  portfolios: Portfolio[];
  organizationId: number | undefined;
  canApproveIntakes: boolean;
  onPmoApprovedChange: (value: boolean) => void;
  // Per-step gating flags (existing behavior preserved for grid/questionnaire blocks)
  showFinancialsForCurrentStep: boolean;
  showArchitectureForCurrentStep: boolean;
  showCybersecurityForCurrentStep: boolean;
  showCostingChecklistForCurrentStep: boolean;
  // Source panel renderer (kept inside parent file for now to avoid moving the component)
  renderSourcePanel: () => ReactNode;
  renderCustomFieldsBlock: (excludeDefinitionIds: number[]) => ReactNode;
}

export interface IntakeFormRendererProps {
  layout: IntakeTabLayoutTabFull[];
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  ctx: IntakeFormRendererContext;
}

export function IntakeFormRenderer({ layout, activeTab, onActiveTabChange, ctx }: IntakeFormRendererProps) {
  const visibleTabs = layout.filter(t => t.isActive);
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
          {tab.sections.map(section => (
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
    return (
      <IntakeFieldRenderer
        fieldKey={item.itemKey}
        intake={ctx.intake}
        formData={ctx.formData}
        onChange={ctx.onFieldChange}
        isLocked={ctx.isLocked}
        portfolios={ctx.portfolios}
        isRequired={REQUIRED_FIELD_KEYS.has(item.itemKey)}
      />
    );
  }
  if (item.itemType === "custom_field") {
    const defId = Number(item.itemKey);
    if (!Number.isFinite(defId)) {
      return <div className="text-xs text-destructive">Invalid custom field reference: {item.itemKey}</div>;
    }
    return (
      <IntakeSingleCustomField
        intakeId={ctx.intake.id}
        organizationId={ctx.organizationId}
        definitionId={defId}
        isLocked={ctx.isLocked}
      />
    );
  }
  return <BlockRenderer blockKey={item.itemKey} ctx={ctx} placedCustomFieldIds={placedCustomFieldIds} bare={bare} />;
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
      if (!ctx.canApproveIntakes) return null;
      return (
        <Card className={cn("border-primary/20", bare && "")}>
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
                checked={ctx.formData.pmoApproved ?? ctx.intake.pmoApproved ?? false}
                onCheckedChange={(checked) => ctx.onPmoApprovedChange(!!checked)}
                disabled={ctx.isLocked}
                data-testid="checkbox-pmo-approved"
              />
              <Label htmlFor="pmoApproved" className="text-sm cursor-pointer font-medium">
                PM has reviewed and approved this intake for project conversion
              </Label>
            </div>
            {(ctx.formData.pmoApproved ?? ctx.intake.pmoApproved) && (
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <Check className="h-4 w-4" />
                PM approval granted. This intake is ready for conversion by an admin.
              </p>
            )}
            {!(ctx.formData.pmoApproved ?? ctx.intake.pmoApproved) && !ctx.isLocked && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                PM approval is required before the "Approve &amp; Convert" button can be used.
              </p>
            )}
          </CardContent>
        </Card>
      );
    default:
      return <div className="text-xs text-destructive">Unknown block: {blockKey}</div>;
  }
}
