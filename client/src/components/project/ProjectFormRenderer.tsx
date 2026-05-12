import { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  FileText, ClipboardList, DollarSign, Settings as SettingsIcon, ListChecks, Lightbulb, Calculator, Shield, MessageSquare, Gavel,
  CalendarDays, Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Portfolio, Program, Resource } from "@shared/schema";
import type { ProjectFormLayoutTabFull, ProjectFormLayoutSectionFull, ProjectFormLayoutItemFull } from "@/hooks/use-project-form-layout";
import { ProjectFieldRenderer } from "./ProjectFieldRenderer";
import { ProjectSingleCustomField } from "./ProjectSingleCustomField";
import { ProjectExecutiveSummariesBlock } from "./ProjectExecutiveSummariesBlock";
import { ProjectPmoCommentsBlock } from "./ProjectPmoCommentsBlock";
import { ProjectSoftwareLicensesBlock } from "./ProjectSoftwareLicensesBlock";

const ICONS: Record<string, LucideIcon> = {
  FileText, ClipboardList, DollarSign, Settings: SettingsIcon, ListChecks, Lightbulb,
  Calculator, Shield, MessageSquare, Gavel, CalendarDays, Users: UsersIcon,
};

const WIDTH_CLASS: Record<string, string> = {
  full: "col-span-12",
  half: "col-span-12 md:col-span-6",
  third: "col-span-12 md:col-span-4",
};

export interface ProjectFormRendererContext {
  project: any;
  organizationId: number | undefined;
  isLocked: boolean;
  portfolios: Portfolio[];
  programs: Program[];
  resources: Resource[];
  onFieldChange: (field: string, value: any) => void;
  renderCustomFieldsBlock: (excludeDefinitionIds: number[]) => ReactNode;
  // Field keys (and `cf:<defId>` for custom fields) that the current workflow
  // step marks as required. Drives the red-asterisk mandatory indicator on
  // the form even before the user tries to advance the gate.
  currentStepRequiredFields?: string[];
}

export interface ProjectFormRendererProps {
  layout: ProjectFormLayoutTabFull[];
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  ctx: ProjectFormRendererContext;
}

export function ProjectFormRenderer({ layout, activeTab, onActiveTabChange, ctx }: ProjectFormRendererProps) {
  const visibleTabs = layout.filter(t => t.isActive);
  if (visibleTabs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No project form tabs are configured. Ask an admin to configure the project form layout in Settings → Governance → Project Form.
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
          const Icon = (tab.icon && ICONS[tab.icon]) || FileText;
          return (
            <TabsTrigger key={tab.key} value={tab.key} data-testid={`project-form-tab-${tab.key}`}>
              <Icon className="h-4 w-4 mr-1 sm:mr-2" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {visibleTabs.map(tab => (
        <TabsContent key={tab.key} value={tab.key}>
          <div className="grid grid-cols-12 gap-4 items-start">
            {tab.sections.map(section => (
              <div key={section.id} className={WIDTH_CLASS[section.width] ?? WIDTH_CLASS.full}>
                <SectionRenderer section={section} ctx={ctx} placedCustomFieldIds={placedIds} />
              </div>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function SectionRenderer({ section, ctx, placedCustomFieldIds }: { section: ProjectFormLayoutSectionFull; ctx: ProjectFormRendererContext; placedCustomFieldIds: number[] }) {
  const hasHeader = !!(section.title && section.title.trim()) || !!section.description;
  if (section.items.length === 0) return null;
  return (
    <Card data-testid={`project-form-section-${section.id}`}>
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

function ItemRenderer({ item, ctx, placedCustomFieldIds }: { item: ProjectFormLayoutItemFull; ctx: ProjectFormRendererContext; placedCustomFieldIds: number[] }) {
  if (item.itemType === "field") {
    const requiredByStep = ctx.currentStepRequiredFields?.includes(item.itemKey) ?? false;
    return (
      <ProjectFieldRenderer
        fieldKey={item.itemKey}
        project={ctx.project}
        onChange={ctx.onFieldChange}
        isLocked={ctx.isLocked}
        portfolios={ctx.portfolios}
        programs={ctx.programs}
        resources={ctx.resources}
        labelOverride={item.displayName}
        isRequired={requiredByStep}
      />
    );
  }
  if (item.itemType === "custom_field") {
    const defId = Number(item.itemKey);
    if (!Number.isFinite(defId)) {
      return <div className="text-xs text-destructive">Invalid custom field reference: {item.itemKey}</div>;
    }
    const requiredByStep = ctx.currentStepRequiredFields?.includes(`cf:${defId}`) ?? false;
    return (
      <ProjectSingleCustomField
        projectId={ctx.project.id}
        organizationId={ctx.organizationId}
        definitionId={defId}
        isLocked={ctx.isLocked}
        project={ctx.project}
        labelOverride={item.displayName}
        isRequiredOverride={requiredByStep}
      />
    );
  }
  // block
  if (item.itemKey === "custom_fields") {
    return <>{ctx.renderCustomFieldsBlock(placedCustomFieldIds)}</>;
  }
  if (item.itemKey === "executive_summaries") {
    return (
      <ProjectExecutiveSummariesBlock
        projectId={ctx.project.id}
        organizationId={ctx.organizationId}
        isLocked={ctx.isLocked}
      />
    );
  }
  if (item.itemKey === "pmo_comments") {
    return (
      <ProjectPmoCommentsBlock
        projectId={ctx.project.id}
        organizationId={ctx.organizationId}
        isLocked={ctx.isLocked}
      />
    );
  }
  if (item.itemKey === "software_licenses") {
    return (
      <ProjectSoftwareLicensesBlock
        projectId={ctx.project.id}
        organizationId={ctx.organizationId}
        isLocked={ctx.isLocked}
      />
    );
  }
  return <div className="text-xs text-destructive">Unknown block: {item.itemKey}</div>;
}
