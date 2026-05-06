import { pgTable, text, serial, integer, boolean, timestamp, date, varchar, jsonb, uniqueIndex, index, customType, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

const numeric = customType<{ data: number; driverData: string }>({
  dataType() { return 'numeric'; },
  fromDriver(value: string): number { return (value == null) ? 0 : Number(value); },
  toDriver(value: number): string { return (value == null) ? '0' : String(value); },
});
import { users } from "./models/auth";

// Core project lifecycle states (in-flight only). Use PROJECT_STATUSES_EXTENDED
// for any UI dropdown that must also represent terminal states.
export const PROJECT_STATUSES_CORE = ["Initiation", "Planning", "Execution", "Monitoring", "Closing"] as const;
export const PROJECT_STATUSES_EXTENDED = [...PROJECT_STATUSES_CORE, "Billing", "Closed"] as const;
// Backwards-compatible alias: PROJECT_STATUSES historically referred to the
// short list and silently truncated dropdowns. It now points at the extended
// list so projects in "Billing"/"Closed" render correctly everywhere.
export const PROJECT_STATUSES = PROJECT_STATUSES_EXTENDED;
export const PROJECT_HEALTH_VALUES = ["Green", "Yellow", "Red"] as const;
export const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const BILLABLE_STATUSES = ["N/A", "On Track", "Waiting for Approval", "Verbal Approval", "Email Approval", "SOW Signed", "PO Received", "Partially Invoiced", "At Risk", "Ready for Invoice", "Critical", "Invoiced"] as const;
export const ISSUE_TYPES = ["Bug", "Enhancement", "Task", "Question", "Defect", "Support"] as const;
export const TASK_STATUS = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;
export const TASK_PRIORITY = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
} as const;
export const TASK_STATUSES = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const DEFAULT_TASK_STATUS: string = TASK_STATUS.NOT_STARTED;
export const DEFAULT_TASK_PRIORITY: string = TASK_PRIORITY.MEDIUM;

// Canonical issue status/priority lists. Keep aligned with the OpenAPI spec
// (server/openapi-schemas.ts) and the column comments on the issues table.
export const ISSUE_STATUSES = ["Open", "In Progress", "Pending", "Resolved", "Closed", "Escalated"] as const;
export const ISSUE_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

// Canonical risk status/priority lists. Risks share the issues table but use
// their own status vocabulary (see issues.status column comment).
export const RISK_STATUSES = ["Identified", "Open", "In Mitigation", "Mitigated", "Closed", "Accepted"] as const;
// Canonical 5-tier scales for risk probability and impact. Imported by both
// the create- and edit-risk dialogs so the UI cannot drift from the API
// contract (which previously hid 'Very Low' / 'Very High' from users and
// crashed the edit dialog when an outlier value loaded).
export const PROBABILITY_LEVELS = ["Very Low", "Low", "Medium", "High", "Very High"] as const;
export const IMPACT_LEVELS = ["Very Low", "Low", "Medium", "High", "Very High"] as const;
export type ProbabilityLevel = typeof PROBABILITY_LEVELS[number];
export type ImpactLevel = typeof IMPACT_LEVELS[number];
export const RISK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export type RiskPriority = (typeof RISK_PRIORITIES)[number];

// Audit trail: fields tracked by the risk update history.
// Names MUST match Drizzle camelCase column properties on the issues table
// (e.g. mitigationPlan, ownerId — not "mitigation"/"owner").
export const RISK_TRACKED_FIELDS = [
  "title",
  "description",
  "probability",
  "impact",
  "status",
  "mitigationPlan",
  "ownerId",
] as const;
export type RiskTrackedField = (typeof RISK_TRACKED_FIELDS)[number];

export const projectStatusEnum = z.enum(PROJECT_STATUSES_EXTENDED);
export const issueTypeEnum = z.enum(ISSUE_TYPES);
export const projectHealthEnum = z.enum(PROJECT_HEALTH_VALUES);
export const projectPriorityEnum = z.enum(PROJECT_PRIORITIES);
export const billableStatusEnum = z.enum(BILLABLE_STATUSES);
export const taskStatusEnum = z.enum(TASK_STATUSES);
export const taskPriorityEnum = z.enum(TASK_PRIORITIES);
export const issueStatusEnum = z.enum(ISSUE_STATUSES);
export const issuePriorityEnum = z.enum(ISSUE_PRIORITIES);
export const riskStatusEnum = z.enum(RISK_STATUSES);
export const riskPriorityEnum = z.enum(RISK_PRIORITIES);

// Build a friendly error message for invalid enum values that lists every
// allowed option, e.g. "status: Invalid value 'Done'. Allowed values: Not
// Started, In Progress, On Hold, Completed, Cancelled". Used by the task /
// issue / risk insert schemas so API clients get an actionable response
// instead of Zod's terse default.
//
// Implemented with z.string().refine(...) (rather than z.enum) so the inferred
// TypeScript type stays a wide `string`. This keeps the runtime contract
// strict (invalid values are rejected with a clear message) while preserving
// compatibility with the many callers that still pass string-typed status /
// priority values into insert / update payloads.
function enumWithMessage<T extends readonly [string, ...string[]]>(values: T, fieldLabel: string) {
  const allowed = values.join(", ");
  const allowedSet = new Set<string>(values);
  return z.string().superRefine((value, ctx) => {
    if (!allowedSet.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid ${fieldLabel} '${value}'. Allowed values: ${allowed}`,
      });
    }
  });
}

export const fridayAgentConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic"]).default("openai"),
  useOrgAzure: z.boolean().default(false),
  azureEndpoint: z.string().max(500).default(""),
  azureApiKey: z.string().max(500).default(""),
  azureDeployment: z.string().max(200).default(""),
  azureApiVersion: z.string().max(50).default("2024-12-01-preview"),
  anthropicApiKey: z.string().max(500).default(""),
  anthropicModel: z.string().max(200).default("claude-3-5-sonnet-latest"),
});

export type FridayAgentConfig = z.infer<typeof fridayAgentConfigSchema>;

export const DEFAULT_FRIDAY_AGENT_CONFIG: FridayAgentConfig = {
  provider: "openai",
  useOrgAzure: false,
  azureEndpoint: "",
  azureApiKey: "",
  azureDeployment: "",
  azureApiVersion: "2024-12-01-preview",
  anthropicApiKey: "",
  anthropicModel: "claude-3-5-sonnet-latest",
};

export * from "./models/auth";
export * from "./models/chat";
export * from "./models/billing";

// === SIDEBAR STRUCTURE TYPES ===

export const sidebarItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("module"),
    key: z.string(),
    hidden: z.boolean().optional(),
    customLabel: z.string().optional(),
  }),
  z.object({
    type: z.literal("customLink"),
    id: z.string(),
    label: z.string(),
    url: z.string().url(),
    icon: z.string().optional(),
    openInNewTab: z.boolean().default(true),
    openMode: z.enum(["newTab", "iframe"]).default("newTab"),
    hidden: z.boolean().optional(),
  }),
]);

export const sidebarGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean().optional(),
  hidden: z.boolean().optional(),
  collapsedByDefault: z.boolean().optional(),
  items: z.array(sidebarItemSchema),
});

export const sidebarStructureSchema = z.array(sidebarGroupSchema);

export type SidebarItem = z.infer<typeof sidebarItemSchema>;
export type SidebarGroup = z.infer<typeof sidebarGroupSchema>;
export type SidebarStructure = z.infer<typeof sidebarStructureSchema>;

export const riskAssessmentConfigSchema = z.object({
  model: z.enum(["gpt-4o", "gpt-4o-mini"]).default("gpt-4o"),
  temperature: z.number().min(0).max(1).default(0.3),
  maxTokens: z.number().min(500).max(8000).default(3000),
  cacheDays: z.number().min(1).max(30).default(5),
  thresholds: z.object({
    lowMax: z.number().min(1).max(99).default(25),
    mediumMax: z.number().min(1).max(99).default(50),
    highMax: z.number().min(1).max(99).default(75),
  }).default({}),
  customInstructions: z.string().max(2000).default(""),
  categories: z.array(z.string()).default(["Schedule Risk", "Budget Risk", "Resource Risk", "Technical Risk", "Scope Risk"]),
  useCustomLLM: z.boolean().default(false),
  customEndpoint: z.string().max(500).default(""),
  customApiKey: z.string().max(500).default(""),
  customModel: z.string().max(200).default(""),
});

export type RiskAssessmentConfig = z.infer<typeof riskAssessmentConfigSchema>;

export const schedulingDefaultsSchema = z.object({
  defaultDependencyType: z.enum(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish']).default('finish-to-start'),
  defaultLagDays: z.number().int().min(-30).max(90).default(0),
  enforceDefaults: z.boolean().default(false),
});

export type SchedulingDefaults = z.infer<typeof schedulingDefaultsSchema>;

export const DEFAULT_SCHEDULING_DEFAULTS: SchedulingDefaults = {
  defaultDependencyType: 'finish-to-start',
  defaultLagDays: 0,
  enforceDefaults: false,
};

// Financial types — org-configurable list of buckets shown in the Financials grid.
// `key` is the stable identifier persisted in financial_entries.scenario; `label` is
// purely cosmetic. System types (aop/fcst/act) may be renamed/disabled but never
// deleted, so historical data and audit-log entries always have something to point at.
export const financialTypeSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/, "Key must be lowercase letters, digits, '-' or '_'"),
  label: z.string().min(1).max(40),
  enabled: z.boolean(),
  editable: z.boolean(),
  isSystem: z.boolean().optional(),
});

// Backward-compat: existing rows store `{ scenarios: [...] }`; the new schema
// uses `{ types: [...] }`. Preprocess transparently migrates the older shape on
// read so we don't need a data migration.
export const financialTypesConfigSchema = z.preprocess((val) => {
  if (val && typeof val === "object" && val !== null && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (!("types" in obj) && Array.isArray((obj as any).scenarios)) {
      return { ...obj, types: (obj as any).scenarios };
    }
  }
  return val;
}, z.object({
  types: z.array(financialTypeSchema).min(1).max(20),
}).superRefine((data, ctx) => {
  const keys = new Set<string>();
  for (const s of data.types) {
    if (keys.has(s.key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate type key: ${s.key}` });
    }
    keys.add(s.key);
  }
  if (!data.types.some(s => s.enabled)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one type must be enabled" });
  }
}));

export type FinancialType = z.infer<typeof financialTypeSchema>;
export type FinancialTypesConfig = z.infer<typeof financialTypesConfigSchema>;

export const SYSTEM_FINANCIAL_TYPE_KEYS = ["aop", "fcst", "act"] as const;

export const DEFAULT_FINANCIAL_TYPES: FinancialTypesConfig = {
  types: [
    { key: "aop", label: "AOP", enabled: true, editable: false, isSystem: true },
    { key: "fcst", label: "FCST", enabled: true, editable: true, isSystem: true },
    { key: "act", label: "ACT", enabled: true, editable: true, isSystem: true },
  ],
};

// === Cost Item Categories config ===
// Three configurable hierarchy levels used by the project Financials grid:
// Financial View → Cost Category → Cost Specification. Stored per-org so admins
// can rename/reorder/enable/disable/add custom values. Built-in (system) entries
// can be renamed and disabled but never deleted, so historical financial entries
// referencing them keep rendering correctly.
const slugKey = z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, "Key must be lowercase letters, digits, '-' or '_'");
const labelStr = z.string().min(1).max(60);

export const financialViewSchema = z.object({
  key: slugKey,
  label: labelStr,
  enabled: z.boolean(),
  order: z.number().int(),
  isSystem: z.boolean().optional(),
});

export const costCategorySchema = z.object({
  key: slugKey,
  label: labelStr,
  viewKey: slugKey, // parent Financial View key
  enabled: z.boolean(),
  order: z.number().int(),
  isSystem: z.boolean().optional(),
});

export const costSpecificationSchema = z.object({
  key: slugKey,
  label: labelStr,
  categoryKey: slugKey, // parent Cost Category key
  enabled: z.boolean(),
  order: z.number().int(),
  isSystem: z.boolean().optional(),
});

export const costItemCategoriesConfigSchema = z.object({
  views: z.array(financialViewSchema).min(1).max(50),
  categories: z.array(costCategorySchema).max(500),
  specifications: z.array(costSpecificationSchema).max(2000),
}).superRefine((data, ctx) => {
  // Unique keys per level
  const seenViews = new Set<string>();
  for (const v of data.views) {
    if (seenViews.has(v.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate financial view key: ${v.key}` });
    seenViews.add(v.key);
  }
  const seenCats = new Set<string>();
  for (const c of data.categories) {
    if (seenCats.has(c.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate cost category key: ${c.key}` });
    seenCats.add(c.key);
    if (!seenViews.has(c.viewKey)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Cost category "${c.label}" references unknown view "${c.viewKey}"` });
  }
  const seenSpecs = new Set<string>();
  for (const s of data.specifications) {
    if (seenSpecs.has(s.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate cost specification key: ${s.key}` });
    seenSpecs.add(s.key);
    if (!seenCats.has(s.categoryKey)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Cost specification "${s.label}" references unknown category "${s.categoryKey}"` });
  }
  // No duplicate labels within the same parent (case-insensitive).
  const viewLabels = new Map<string, string>();
  for (const v of data.views) {
    const norm = v.label.trim().toLowerCase();
    if (viewLabels.has(norm)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate financial view label: ${v.label}` });
    viewLabels.set(norm, v.key);
  }
  const catLabelsByView = new Map<string, Set<string>>();
  for (const c of data.categories) {
    const set = catLabelsByView.get(c.viewKey) ?? new Set<string>();
    const norm = c.label.trim().toLowerCase();
    if (set.has(norm)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate cost category "${c.label}" within view "${c.viewKey}"` });
    set.add(norm);
    catLabelsByView.set(c.viewKey, set);
  }
  const specLabelsByCat = new Map<string, Set<string>>();
  for (const s of data.specifications) {
    const set = specLabelsByCat.get(s.categoryKey) ?? new Set<string>();
    const norm = s.label.trim().toLowerCase();
    if (set.has(norm)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate cost specification "${s.label}" within category "${s.categoryKey}"` });
    set.add(norm);
    specLabelsByCat.set(s.categoryKey, set);
  }
});

export type FinancialView = z.infer<typeof financialViewSchema>;
export type CostCategory = z.infer<typeof costCategorySchema>;
export type CostSpecification = z.infer<typeof costSpecificationSchema>;
export type CostItemCategoriesConfig = z.infer<typeof costItemCategoriesConfigSchema>;

// System (built-in) keys; these entries may be renamed/disabled but never deleted.
export const SYSTEM_FINANCIAL_VIEW_KEYS = ["capital", "direct-expense", "labor"] as const;
export const SYSTEM_COST_CATEGORY_KEYS = [
  "cat-direct-expense",
  "cat-licenses",
  "cat-outside-services",
  "cat-travel-meals",
  "cat-project-material",
  "cat-labor",
  "cat-equipment",
  "cat-other",
] as const;

// Default config seeded for orgs that have no saved value. Keeps the same
// labels the grid used to hardcode so behavior is unchanged on first load.
// Each system category is parented to a sensible default Financial View;
// admins can re-parent or duplicate categories under other views from the
// settings UI.
export const DEFAULT_COST_ITEM_CATEGORIES: CostItemCategoriesConfig = {
  views: [
    { key: "capital", label: "Capital", enabled: true, order: 0, isSystem: true },
    { key: "direct-expense", label: "Direct Expense", enabled: true, order: 1, isSystem: true },
    { key: "labor", label: "Labor", enabled: true, order: 2, isSystem: true },
  ],
  categories: [
    { key: "cat-direct-expense", label: "Direct Expense", viewKey: "direct-expense", enabled: true, order: 0, isSystem: true },
    { key: "cat-licenses", label: "Licenses", viewKey: "direct-expense", enabled: true, order: 1, isSystem: true },
    { key: "cat-outside-services", label: "Outside Services", viewKey: "direct-expense", enabled: true, order: 2, isSystem: true },
    { key: "cat-travel-meals", label: "Travel/Meals", viewKey: "direct-expense", enabled: true, order: 3, isSystem: true },
    { key: "cat-other", label: "Other", viewKey: "direct-expense", enabled: true, order: 4, isSystem: true },
    { key: "cat-project-material", label: "Project Material", viewKey: "capital", enabled: true, order: 0, isSystem: true },
    { key: "cat-equipment", label: "Equipment", viewKey: "capital", enabled: true, order: 1, isSystem: true },
    { key: "cat-labor", label: "Labor", viewKey: "labor", enabled: true, order: 0, isSystem: true },
  ],
  // Best-practice starter specifications for IT / SaaS project finance.
  // Marked isSystem:false so admins can rename, disable or delete any
  // they don't need without restriction.
  specifications: [
    // Capital → Project Material
    { key: "spec-pm-servers-storage", label: "Servers & Storage", categoryKey: "cat-project-material", enabled: true, order: 0, isSystem: false },
    { key: "spec-pm-network-equipment", label: "Network Equipment", categoryKey: "cat-project-material", enabled: true, order: 1, isSystem: false },
    { key: "spec-pm-cabling-infrastructure", label: "Cabling & Infrastructure", categoryKey: "cat-project-material", enabled: true, order: 2, isSystem: false },
    { key: "spec-pm-data-center", label: "Data Center Build-out", categoryKey: "cat-project-material", enabled: true, order: 3, isSystem: false },
    { key: "spec-pm-software-capitalized", label: "Capitalized Software", categoryKey: "cat-project-material", enabled: true, order: 4, isSystem: false },

    // Capital → Equipment
    { key: "spec-eq-workstations-laptops", label: "Workstations & Laptops", categoryKey: "cat-equipment", enabled: true, order: 0, isSystem: false },
    { key: "spec-eq-mobile-devices", label: "Mobile Devices", categoryKey: "cat-equipment", enabled: true, order: 1, isSystem: false },
    { key: "spec-eq-peripherals", label: "Peripherals & Accessories", categoryKey: "cat-equipment", enabled: true, order: 2, isSystem: false },
    { key: "spec-eq-furniture-fixtures", label: "Furniture & Fixtures", categoryKey: "cat-equipment", enabled: true, order: 3, isSystem: false },
    { key: "spec-eq-tools-instruments", label: "Tools & Instruments", categoryKey: "cat-equipment", enabled: true, order: 4, isSystem: false },

    // Direct Expense → Direct Expense
    { key: "spec-de-cloud-services", label: "Cloud Services (IaaS/PaaS)", categoryKey: "cat-direct-expense", enabled: true, order: 0, isSystem: false },
    { key: "spec-de-hosting", label: "Hosting & CDN", categoryKey: "cat-direct-expense", enabled: true, order: 1, isSystem: false },
    { key: "spec-de-telecom", label: "Telecom & Connectivity", categoryKey: "cat-direct-expense", enabled: true, order: 2, isSystem: false },
    { key: "spec-de-office-supplies", label: "Office Supplies", categoryKey: "cat-direct-expense", enabled: true, order: 3, isSystem: false },
    { key: "spec-de-shipping", label: "Shipping & Freight", categoryKey: "cat-direct-expense", enabled: true, order: 4, isSystem: false },

    // Direct Expense → Licenses
    { key: "spec-lic-software-perpetual", label: "Software Licenses (Perpetual)", categoryKey: "cat-licenses", enabled: true, order: 0, isSystem: false },
    { key: "spec-lic-saas-subscriptions", label: "SaaS Subscriptions", categoryKey: "cat-licenses", enabled: true, order: 1, isSystem: false },
    { key: "spec-lic-database", label: "Database Licenses", categoryKey: "cat-licenses", enabled: true, order: 2, isSystem: false },
    { key: "spec-lic-dev-tools", label: "Developer Tools", categoryKey: "cat-licenses", enabled: true, order: 3, isSystem: false },
    { key: "spec-lic-security", label: "Security & Compliance Tools", categoryKey: "cat-licenses", enabled: true, order: 4, isSystem: false },
    { key: "spec-lic-maintenance-support", label: "Maintenance & Support", categoryKey: "cat-licenses", enabled: true, order: 5, isSystem: false },

    // Direct Expense → Outside Services
    { key: "spec-os-consulting", label: "Consulting", categoryKey: "cat-outside-services", enabled: true, order: 0, isSystem: false },
    { key: "spec-os-contractors", label: "Contractors / Staff Aug", categoryKey: "cat-outside-services", enabled: true, order: 1, isSystem: false },
    { key: "spec-os-managed-services", label: "Managed Services", categoryKey: "cat-outside-services", enabled: true, order: 2, isSystem: false },
    { key: "spec-os-professional-services", label: "Vendor Professional Services", categoryKey: "cat-outside-services", enabled: true, order: 3, isSystem: false },
    { key: "spec-os-training", label: "Training & Certification", categoryKey: "cat-outside-services", enabled: true, order: 4, isSystem: false },
    { key: "spec-os-legal-audit", label: "Legal & Audit", categoryKey: "cat-outside-services", enabled: true, order: 5, isSystem: false },

    // Direct Expense → Travel/Meals
    { key: "spec-tm-airfare", label: "Airfare", categoryKey: "cat-travel-meals", enabled: true, order: 0, isSystem: false },
    { key: "spec-tm-lodging", label: "Lodging", categoryKey: "cat-travel-meals", enabled: true, order: 1, isSystem: false },
    { key: "spec-tm-ground-transport", label: "Ground Transportation", categoryKey: "cat-travel-meals", enabled: true, order: 2, isSystem: false },
    { key: "spec-tm-meals", label: "Meals", categoryKey: "cat-travel-meals", enabled: true, order: 3, isSystem: false },
    { key: "spec-tm-conferences-events", label: "Conferences & Events", categoryKey: "cat-travel-meals", enabled: true, order: 4, isSystem: false },
    { key: "spec-tm-mileage", label: "Mileage & Per Diem", categoryKey: "cat-travel-meals", enabled: true, order: 5, isSystem: false },

    // Direct Expense → Other
    { key: "spec-ot-contingency", label: "Contingency Reserve", categoryKey: "cat-other", enabled: true, order: 0, isSystem: false },
    { key: "spec-ot-management-reserve", label: "Management Reserve", categoryKey: "cat-other", enabled: true, order: 1, isSystem: false },
    { key: "spec-ot-misc", label: "Miscellaneous", categoryKey: "cat-other", enabled: true, order: 2, isSystem: false },

    // Labor → Labor
    { key: "spec-lb-internal-engineering", label: "Internal — Engineering", categoryKey: "cat-labor", enabled: true, order: 0, isSystem: false },
    { key: "spec-lb-internal-pm", label: "Internal — Project Management", categoryKey: "cat-labor", enabled: true, order: 1, isSystem: false },
    { key: "spec-lb-internal-design", label: "Internal — Design / UX", categoryKey: "cat-labor", enabled: true, order: 2, isSystem: false },
    { key: "spec-lb-internal-qa", label: "Internal — QA / Test", categoryKey: "cat-labor", enabled: true, order: 3, isSystem: false },
    { key: "spec-lb-internal-ops", label: "Internal — Operations / DevOps", categoryKey: "cat-labor", enabled: true, order: 4, isSystem: false },
    { key: "spec-lb-contract-onshore", label: "Contract Labor — Onshore", categoryKey: "cat-labor", enabled: true, order: 5, isSystem: false },
    { key: "spec-lb-contract-offshore", label: "Contract Labor — Offshore", categoryKey: "cat-labor", enabled: true, order: 6, isSystem: false },
    { key: "spec-lb-overtime", label: "Overtime / Premium Time", categoryKey: "cat-labor", enabled: true, order: 7, isSystem: false },
  ],
};

export const DEFAULT_RISK_ASSESSMENT_CONFIG: RiskAssessmentConfig = {
  model: "gpt-4o",
  temperature: 0.3,
  maxTokens: 3000,
  cacheDays: 5,
  thresholds: { lowMax: 25, mediumMax: 50, highMax: 75 },
  customInstructions: "",
  categories: ["Schedule Risk", "Budget Risk", "Resource Risk", "Technical Risk", "Scope Risk"],
  useCustomLLM: false,
  customEndpoint: "",
  customApiKey: "",
  customModel: "",
};

// === TABLE DEFINITIONS ===

// Users (Imported from ./models/auth)

// Organizations (Tenants)
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  description: text("description"),
  logoUrl: text("logo_url"), // Custom company logo URL
  ownerId: varchar("owner_id").references(() => users.id), // Organization creator
  createdAt: timestamp("created_at").defaultNow(),
  hiddenModules: text("hidden_modules").array(), // Legacy: Array of module keys to hide from sidebar
  moduleOrder: text("module_order").array(), // Legacy: Array of module keys defining sidebar order
  hiddenGroups: text("hidden_groups").array(), // Legacy: Array of group keys to hide from sidebar
  sidebarStructure: jsonb("sidebar_structure").$type<SidebarStructure>(), // New: Full sidebar config
  dashboardTabOrder: text("dashboard_tab_order").array(), // Array of tab IDs defining dashboard report order
  dashboardHiddenTabs: text("dashboard_hidden_tabs").array(), // Array of tab IDs hidden in overflow menu
  billingHidden: boolean("billing_hidden").default(false),
  riskAssessmentConfig: jsonb("risk_assessment_config").$type<RiskAssessmentConfig>(),
  schedulingDefaults: jsonb("scheduling_defaults").$type<SchedulingDefaults>(),
  timezone: text("timezone").default("UTC"),
  deactivatedAt: timestamp("deactivated_at"), // Soft delete timestamp
  deactivatedBy: varchar("deactivated_by").references(() => users.id), // Who deactivated
  fridayAgentConfig: jsonb("friday_agent_config"), // Friday AI agent configuration (per-org)
  financialTypesConfig: jsonb("financial_scenarios_config").$type<FinancialTypesConfig>(), // AOP/FCST/ACT and custom financial types (column kept for back-compat)
  costItemCategoriesConfig: jsonb("cost_item_categories_config").$type<CostItemCategoriesConfig>(), // Configurable Financial View / Cost Category / Cost Specification hierarchy
  fiscalYearStartMonth: integer("fiscal_year_start_month").default(10).notNull(), // 1..12 calendar month that is M1 of the org's fiscal year (default 10 = October)
  projectTabSettings: jsonb("project_tab_settings").$type<{ order: string[]; hidden: string[] }>(), // Org-level default order + visibility for project detail tabs
  defaultTemplateAppliedAt: timestamp("default_template_applied_at"), // One-time backfill marker for default project tab template
});

// Organization Members (Join table for users <-> organizations)
export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"), // 'org_admin', 'member', 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueOrgUser: uniqueIndex("unique_org_user").on(table.organizationId, table.userId),
}));

// Organization Invites (Pending invitations by email)
export const organizationInvites = pgTable("organization_invites", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"), // 'org_admin', 'member', 'viewer'
  status: text("status").notNull().default("pending"), // 'pending', 'accepted', 'cancelled', 'expired'
  invitedBy: varchar("invited_by").references(() => users.id),
  token: text("token").unique(), // Magic link token for accepting invite
  expiresAt: timestamp("expires_at"), // When the invite expires
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
}, (table) => ({
  uniquePendingInvite: uniqueIndex("unique_pending_invite").on(table.organizationId, table.email),
}));

// Organization Access Requests (Users requesting admin access)
export const organizationAccessRequests = pgTable("organization_access_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected'
  requestedRole: text("requested_role").notNull().default("org_admin"), // Role being requested
  message: text("message"), // Optional message from requester
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueAccessRequest: uniqueIndex("unique_access_request").on(table.organizationId, table.userId),
}));

// External Shares - Cross-organization object sharing
// When a user from OrgA assigns a resource from OrgB, the object is "shared" externally
export const externalShares = pgTable("external_shares", {
  id: serial("id").primaryKey(),
  objectType: text("object_type").notNull(), // 'project', 'task', 'risk', 'issue', 'portfolio'
  objectId: integer("object_id").notNull(), // ID of the shared object
  sourceOrganizationId: integer("source_organization_id").references(() => organizations.id).notNull(), // Org that owns the object
  sharedWithUserId: varchar("shared_with_user_id").references(() => users.id).notNull(), // User who has access
  sharedWithResourceId: integer("shared_with_resource_id").references(() => resources.id), // Resource record in source org
  accessRole: text("access_role").notNull().default("viewer"), // 'viewer', 'assignee', 'manager'
  sharedBy: varchar("shared_by").references(() => users.id), // Who shared it
  sharedAt: timestamp("shared_at").defaultNow(),
  revokedAt: timestamp("revoked_at"), // When access was revoked (soft delete)
}, (table) => [
  uniqueIndex("external_shares_obj_user_idx").on(table.objectType, table.objectId, table.sharedWithUserId),
]);

// Portfolios - High level grouping of projects
export const portfolios = pgTable("portfolios", {
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  strategy: text("strategy"), // Strategic alignment description
  managerId: varchar("manager_id").references(() => users.id), // Portfolio Manager
  businessOwnerId: varchar("business_owner_id").references(() => users.id), // Business Owner/Executive Sponsor
  strategicObjective: text("strategic_objective"), // Key business objective this portfolio supports
  budgetAllocated: numeric("budget_allocated"), // Total budget allocated to portfolio
  budgetSpent: numeric("budget_spent"), // Total budget spent across projects
  targetStartDate: date("target_start_date"), // Portfolio timeline start
  targetEndDate: date("target_end_date"), // Portfolio timeline end
  riskTolerance: text("risk_tolerance"), // Low, Medium, High - acceptable risk level
  performanceMetrics: text("performance_metrics"), // KPIs for portfolio success
  status: text("status").default("Active"), // Active, On Hold, Closed, Archived
  healthScore: text("health_score").default("Green"), // Green, Yellow, Red - overall health
  department: text("department"), // Primary department/business unit
  notes: text("notes"), // Additional notes
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id), // Who created the portfolio
  teamMemberResourceIds: integer("team_member_resource_ids").array(), // Resource IDs with team member access
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
  deletedBy: varchar("deleted_by").references(() => users.id), // Who deleted it
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
  isCustom: boolean("is_custom").default(false), // Custom portfolios can include projects from any portfolio
});

// Portfolio Key Dates - important dates tracked at the portfolio level
export const portfolioKeyDates = pgTable("portfolio_key_dates", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  keyDateType: text("key_date_type").default("Deadline"),
  date: date("date").notNull(),
  status: text("status").default("Upcoming"),
  completed: boolean("completed").default(false),
  notes: text("notes"),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("portfolio_key_dates_portfolio_id_idx").on(table.portfolioId),
  index("portfolio_key_dates_organization_id_idx").on(table.organizationId),
]);

// Custom Portfolio Projects - junction table for custom portfolios
export const customPortfolioProjects = pgTable("custom_portfolio_projects", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  addedAt: timestamp("added_at").defaultNow(),
  addedBy: varchar("added_by").references(() => users.id),
}, (table) => [
  uniqueIndex("custom_portfolio_projects_unique").on(table.portfolioId, table.projectId),
]);

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  workflowId: integer("workflow_id"), // FK to project_workflows.id (nullable; assigned when org has multiple workflows)
  name: text("name").notNull(),
  projectCode: text("project_code"), // Unique project identifier (e.g., "PRJ-2025-001")
  description: text("description"),
  status: text("status").notNull().default("Initiation"), // Initiation, Planning, Execution, Monitoring, Closing
  priority: text("priority").notNull().default("Medium"), // Low, Medium, High, Critical
  projectType: text("project_type"), // Internal, External, Strategic, Operational, Regulatory
  methodology: text("methodology"), // Waterfall, Agile, Hybrid, Scrum, Kanban
  startDate: date("start_date"),
  endDate: date("end_date"),
  baselineStartDate: date("baseline_start_date"), // Original planned start
  baselineEndDate: date("baseline_end_date"), // Original planned end
  actualStartDate: date("actual_start_date"), // When work actually started
  actualEndDate: date("actual_end_date"), // When work actually finished
  budget: numeric("budget").notNull().default(0),
  actualCost: numeric("actual_cost").default(0), // Actual spend to date
  forecastCost: numeric("forecast_cost"), // Projected final cost
  contractTotal: numeric("contract_total").default(0), // Total contract value for invoicing
  managerId: varchar("manager_id").references(() => users.id), // Project Manager (user ID)
  managerResourceId: integer("manager_resource_id").references(() => resources.id), // Project Manager (resource ID for display)
  businessSponsorId: varchar("business_sponsor_id").references(() => users.id), // Executive Sponsor
  sponsorResourceId: integer("sponsor_resource_id").references(() => resources.id),
  businessOwnerId: varchar("business_owner_id").references(() => users.id), // Product/Business Owner
  ownerResourceId: integer("owner_resource_id").references(() => resources.id),
  technicalLeadId: varchar("technical_lead_id").references(() => users.id), // Technical Lead
  technicalLeadResourceId: integer("technical_lead_resource_id").references(() => resources.id),
  completionPercentage: integer("completion_percentage").default(0),
  completionOverridden: boolean("completion_overridden").default(false), // True if user manually set completion percentage
  health: text("health").default("Green"), // Green, Yellow, Red
  healthReason: text("health_reason"), // Reason for health status change
  healthReasonUpdatedAt: timestamp("health_reason_updated_at"), // When health reason was last updated
  scheduleVariance: integer("schedule_variance"), // Days ahead/behind schedule (negative = behind)
  costVariance: numeric("cost_variance"), // Budget variance (negative = over budget)
  scope: text("scope"), // Project scope statement
  objectives: text("objectives"), // Key project objectives
  successCriteria: text("success_criteria"), // How success will be measured
  constraints: text("constraints"), // Known constraints
  assumptions: text("assumptions"), // Project assumptions
  dependencies: text("dependencies"), // External dependencies
  department: text("department"), // Primary department
  category: text("category"), // Project category (IT, Marketing, Operations, etc.)
  businessValue: text("business_value"), // Expected business value/ROI
  riskLevel: text("risk_level"), // Low, Medium, High - overall risk assessment
  source: text("source").default("manual"), // "manual" = created in app, "imported" = from MPP/external file, "planner" = from Microsoft Planner
  plannerPlanId: text("planner_plan_id"), // Microsoft Planner plan ID for syncing
  dataverseOrgId: text("dataverse_org_id"), // Dataverse organization ID for Planner Premium URL construction
  dataverseTenantId: text("dataverse_tenant_id"), // Microsoft tenant ID for Planner Premium URL construction
  sourceFileName: text("source_file_name"), // Original filename of imported file (e.g., "project.mpp")
  sourceFileUrl: text("source_file_url"), // URL to the original imported file (in object storage)
  notes: text("notes"), // Additional notes
  billableStatus: text("billable_status").default("N/A"), // Billable status: N/A, On Track, Waiting for Approval, etc.
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id), // Who created the project
  updatedAt: timestamp("updated_at").defaultNow(), // Last modification date
  updatedBy: varchar("updated_by").references(() => users.id), // Who last modified the project
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
  isInternal: boolean("is_internal").default(false),
  timesheetBlocked: boolean("timesheet_blocked").default(false),
  // Location & Media
  addressLine1: text("address_line1"),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  postalCode: text("postal_code"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  images: jsonb("images").$type<Array<{ url: string; alt?: string }>>().default([]),
}, (table) => [
  index("projects_org_id_idx").on(table.organizationId),
  index("projects_portfolio_id_idx").on(table.portfolioId),
  index("projects_org_portfolio_deleted_idx").on(table.organizationId, table.portfolioId, table.deletedAt),
  index("projects_manager_id_idx").on(table.managerId),
  index("projects_deleted_at_idx").on(table.deletedAt),
]);

// Billable Status Comments (Comment log for billable status field)
export const billableStatusComments = pgTable("billable_status_comments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  billableStatus: text("billable_status"), // The billable status value at time of comment
  comment: text("comment").notNull(),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"), // User's display name at time of comment
  createdAt: timestamp("created_at").defaultNow(),
});

// Health Status History (Track all health status changes with comments)
export const healthStatusHistory = pgTable("health_status_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  previousHealth: text("previous_health"), // Previous health status (Green, Yellow, Red, or null if first entry)
  newHealth: text("new_health").notNull(), // New health status (Green, Yellow, Red)
  comment: text("comment"), // Optional comment/reason for the change
  changedBy: varchar("changed_by").references(() => users.id), // User who made the change
  changedByName: text("changed_by_name"), // User's display name at time of change
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
});

// Note: Risks are now consolidated into the issues table with itemType = "risk"
// The 'risks' table is deprecated - use issues with itemType filter instead

// Portfolio Key Dates (formerly Milestones)
/** @deprecated Use tasks table with isMilestone=true instead. This table is kept for backward compatibility but is no longer read from or written to. All portfolio key date data has been migrated to the tasks table. */
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  milestoneNumber: text("milestone_number"), // Auto-generated (e.g., "MS-001")
  title: text("title").notNull(),
  description: text("description"),
  milestoneType: text("milestone_type"), // Governance, Deliverable, Phase Gate, External, Payment
  dueDate: date("due_date").notNull(),
  baselineDueDate: date("baseline_due_date"), // Original planned due date
  actualCompletionDate: date("actual_completion_date"),
  startDate: date("start_date"),
  completed: boolean("completed").default(false),
  status: text("status").default("Backlog"), // Backlog, To Do, In Progress, Completed, Delayed
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  ownerId: varchar("owner_id").references(() => users.id), // Milestone owner
  assignee: text("assignee"),
  deliverables: text("deliverables"), // Expected deliverables for this milestone
  acceptanceCriteria: text("acceptance_criteria"), // Criteria for completion
  dependencies: text("dependencies"), // Dependencies on other milestones/tasks
  successMetrics: text("success_metrics"), // How success will be measured
  stakeholders: text("stakeholders"), // Key stakeholders
  phase: text("phase"), // Project phase this milestone belongs to
  notes: text("notes"),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
}, (table) => [
  index("milestones_project_id_idx").on(table.projectId),
  index("milestones_organization_id_idx").on(table.organizationId),
  index("milestones_owner_id_idx").on(table.ownerId),
]);

// Issues (consolidated - includes both issues and risks via itemType)
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  itemType: text("item_type").default("issue").notNull(), // "issue" or "risk" - distinguishes the type
  issueNumber: text("issue_number"), // Auto-generated (e.g., "ISS-001" or "RISK-001")
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"), // Technical, Process, Resource, External, Scope (issues) or Technical, Schedule, Resource, External, Organizational, Financial (risks)
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  severity: text("severity"), // Minor, Moderate, Major, Critical, Blocker
  status: text("status").default("Open"), // Open, In Progress, Pending, Resolved, Closed, Escalated (issues) or Identified, Open, In Mitigation, Mitigated, Closed, Accepted (risks)
  type: text("type").default("Bug"), // Bug, Enhancement, Task, Question, Defect, Support (for issues only)
  escalationLevel: text("escalation_level"), // None, Team Lead, Manager, Director, Executive
  assignee: text("assignee"),
  assigneeId: varchar("assignee_id").references(() => users.id), // Issue assignee
  reporterId: varchar("reporter_id").references(() => users.id), // Who reported the issue
  reportedBy: text("reported_by"), // Name of reporter (for external reports)
  reportedDate: date("reported_date"),
  targetResolutionDate: date("target_resolution_date"),
  actualResolutionDate: date("actual_resolution_date"),
  resolution: text("resolution"), // How the issue was resolved
  rootCause: text("root_cause"), // Root cause analysis
  impactDescription: text("impact_description"), // Impact on project
  impactCost: numeric("impact_cost"), // Cost impact
  impactSchedule: text("impact_schedule"), // Schedule impact
  relatedTaskId: integer("related_task_id").references(() => tasks.id), // Related task
  stepsToReproduce: text("steps_to_reproduce"), // For bugs
  environment: text("environment"), // Environment where issue occurred
  labels: text("labels"), // Comma-separated labels
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
  // Risk-specific fields (only used when itemType = "risk")
  probability: text("probability"), // Very Low, Low, Medium, High, Very High
  impact: text("impact"), // Very Low, Low, Medium, High, Very High
  riskScore: integer("risk_score"), // Calculated score (probability x impact)
  responseStrategy: text("response_strategy"), // Avoid, Transfer, Mitigate, Accept
  mitigationPlan: text("mitigation_plan"),
  contingencyPlan: text("contingency_plan"), // Backup plan if risk occurs
  triggerEvents: text("trigger_events"), // What triggers this risk
  residualRisk: text("residual_risk"), // Remaining risk after mitigation
  ownerId: varchar("owner_id").references(() => users.id), // Risk owner
  reviewerId: varchar("reviewer_id").references(() => users.id), // Risk reviewer
  identifiedDate: date("identified_date"), // When risk was identified
  targetResolutionDateRisk: date("target_resolution_date_risk"),
  actualResolutionDateRisk: date("actual_resolution_date_risk"),
  costExposure: numeric("cost_exposure"), // Expected monetary value of risk (probability × impact cost)
  dueDate: date("due_date"), // Risk due date for time-based placement on radar
  proximity: text("proximity"), // Imminent, Near-term, Mid-term, Long-term
  // Portfolio escalation fields
  escalatedToPortfolio: boolean("escalated_to_portfolio").default(false), // Whether escalated to portfolio level
  escalatedAt: timestamp("escalated_at"), // When it was escalated
  escalatedBy: varchar("escalated_by").references(() => users.id), // Who escalated it
}, (table) => [
  index("issues_project_id_idx").on(table.projectId),
  index("issues_item_type_idx").on(table.itemType),
  index("issues_project_item_type_idx").on(table.projectId, table.itemType),
  index("issues_assignee_id_idx").on(table.assigneeId),
  index("issues_owner_id_idx").on(table.ownerId),
  index("issues_status_idx").on(table.status),
]);

// Tasks (for Gantt Chart)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  taskIndex: integer("task_index"), // Sequential index for ordering tasks (1, 2, 3... per project)
  taskNumber: text("task_number"), // Auto-generated (e.g., "TASK-001")
  wbs: text("wbs"), // Work Breakdown Structure code (e.g., "1.2.3") - MS Project style
  name: text("name").notNull(),
  description: text("description"),
  taskType: text("task_type"), // Work, Milestone, Summary, Fixed Duration, Fixed Units, Ongoing
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  startDate: date("start_date"),
  endDate: date("end_date"),
  baselineStartDate: date("baseline_start_date"), // Original planned start
  baselineEndDate: date("baseline_end_date"), // Original planned end
  actualStartDate: date("actual_start_date"), // When work actually started
  actualEndDate: date("actual_end_date"), // When work actually finished
  durationDays: numeric("duration_days"), // Duration in days (supports fractional, e.g. 0.5 = 4h)
  estimatedHours: numeric("estimated_hours"), // Estimated effort in hours
  actualHours: numeric("actual_hours"), // Actual hours worked
  remainingHours: numeric("remaining_hours"), // Remaining effort
  progress: integer("progress").default(0), // 0-100 percentage
  status: text("status").default("Not Started"), // Not Started, In Progress, On Hold, Completed, Cancelled
  constraintType: text("constraint_type"), // ASAP, ALAP, Start No Earlier Than, Finish No Later Than, Must Start On, Must Finish On
  constraintDate: date("constraint_date"), // Date for constraint if applicable
  assignee: text("assignee"),
  ownerId: varchar("owner_id").references(() => users.id), // Task owner/lead
  outlineLevel: integer("outline_level"), // Hierarchy level (1, 2, 3...)
  parentId: integer("parent_id"), // Self-ref FK managed in migrate.ts with NOT VALID for safe production deploys
  isMilestone: boolean("is_milestone").default(false), // Show task on project timeline
  isSummary: boolean("is_summary").default(false), // Is a summary/parent task
  isCritical: boolean("is_critical").default(false), // On critical path
  isOngoing: boolean("is_ongoing").default(false), // Ongoing/operational task without scheduled dates
  schedulingMode: text("scheduling_mode").default("auto"), // 'auto' = auto-scheduled, 'manual' = manually scheduled (dates optional)
  cost: numeric("cost"), // Budget for this task
  actualCost: numeric("actual_cost"), // Actual cost incurred
  phase: text("phase"), // Project phase this task belongs to
  category: text("category"), // Task category
  labels: text("labels"), // Comma-separated labels
  notes: text("notes"),
  notesUpdatedAt: timestamp("notes_updated_at"),
  notesUpdatedBy: varchar("notes_updated_by").references(() => users.id),
  notesUpdatedByName: text("notes_updated_by_name"),
  timesheetBlocked: boolean("timesheet_blocked").default(false),
  externalId: text("external_id"),
  completionOverridden: boolean("completion_overridden").default(false),
  milestoneNumber: text("milestone_number"),
  milestoneType: text("milestone_type"),
  deliverables: text("deliverables"),
  acceptanceCriteria: text("acceptance_criteria"),
  successMetrics: text("success_metrics"),
  stakeholders: text("stakeholders"),
  updatedAt: timestamp("updated_at").defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("tasks_project_id_idx").on(table.projectId),
  index("tasks_parent_id_idx").on(table.parentId),
  index("tasks_deleted_at_idx").on(table.deletedAt),
  index("tasks_start_date_idx").on(table.startDate),
  index("tasks_end_date_idx").on(table.endDate),
  index("tasks_status_idx").on(table.status),
  index("tasks_created_at_idx").on(table.createdAt),
  index("tasks_project_deleted_task_idx").on(table.projectId, table.deletedAt, table.taskIndex),
  index("tasks_owner_id_idx").on(table.ownerId),
  index("tasks_project_external_id_idx").on(table.projectId, table.externalId),
]);

// Task Change Logs (Audit Trail)
export const taskChangeLogs = pgTable("task_change_logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"), // Store name for display even if user is deleted
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(), // 'created', 'updated', 'deleted'
  changeSummary: text("change_summary"), // Human-readable summary
  previousValues: text("previous_values"), // JSON string of changed fields before
  newValues: text("new_values"), // JSON string of changed fields after
}, (table) => [
  index("task_change_logs_task_id_idx").on(table.taskId),
]);

export const taskNotesHistory = pgTable("task_notes_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  previousNotes: text("previous_notes"),
  newNotes: text("new_notes"),
}, (table) => [
  index("task_notes_history_task_id_idx").on(table.taskId),
]);

// Project Change Logs (Audit Trail)
export const projectChangeLogs = pgTable("project_change_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
}, (table) => [
  index("project_change_logs_project_id_idx").on(table.projectId),
]);

// Note: Risk Change Logs are now consolidated into Issue Change Logs
// The 'risk_change_logs' table is deprecated - use issue_change_logs instead

// Issue Change Logs (Audit Trail) - also handles risks since they're now in issues table
export const issueChangeLogs = pgTable("issue_change_logs", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
}, (table) => [
  index("issue_change_logs_issue_id_idx").on(table.issueId),
]);

// Task Dependencies
export const taskDependencies = pgTable("task_dependencies", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  dependsOnTaskId: integer("depends_on_task_id").references(() => tasks.id).notNull(),
  dependencyType: text("dependency_type").default("finish-to-start"), // finish-to-start, start-to-start, finish-to-finish, start-to-finish
  lagDays: integer("lag_days").default(0), // Lag or lead time in days (negative for lead)
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("task_dependencies_task_id_idx").on(table.taskId),
  index("task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
]);

// Cross-Project References (links between tasks in different projects, or between projects)
export const crossProjectReferences = pgTable("cross_project_references", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  referenceType: text("reference_type").notNull(), // 'task_to_task' | 'project_to_project'
  sourceType: text("source_type").notNull(), // 'task' | 'project'
  sourceId: integer("source_id").notNull(),
  sourceProjectId: integer("source_project_id").references(() => projects.id).notNull(),
  targetType: text("target_type").notNull(), // 'task' | 'project'
  targetId: integer("target_id").notNull(),
  targetProjectId: integer("target_project_id").references(() => projects.id).notNull(),
  relationshipType: text("relationship_type").notNull(), // 'blocks', 'is_blocked_by', 'relates_to', 'duplicates', 'depends_on', 'is_dependency_of'
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cross_project_refs_org_idx").on(table.organizationId),
  index("cross_project_refs_source_idx").on(table.sourceType, table.sourceId),
  index("cross_project_refs_target_idx").on(table.targetType, table.targetId),
]);

export const insertCrossProjectReferenceSchema = createInsertSchema(crossProjectReferences).omit({
  id: true,
  createdAt: true,
});
export type CrossProjectReference = typeof crossProjectReferences.$inferSelect;
export type InsertCrossProjectReference = z.infer<typeof insertCrossProjectReferenceSchema>;

// Resources (Global list of team members/resources)
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id), // Links to organization member user (for auto-synced resources)
  resourceCode: text("resource_code"), // Unique identifier (e.g., "EMP-001")
  resourceType: text("resource_type"), // Employee, Contractor, Vendor, Equipment, Material
  displayName: text("display_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  title: text("title"), // Job title/role
  department: text("department"),
  costCenter: text("cost_center"), // Cost center for billing
  location: text("location"), // Office location
  timezone: text("timezone"), // Resource timezone
  managerId: varchar("manager_id").references(() => users.id), // Direct manager
  skills: text("skills"), // Comma-separated skills
  certifications: text("certifications"), // Comma-separated certifications
  experienceLevel: text("experience_level"), // Junior, Mid-Level, Senior, Lead, Principal
  hourlyRate: numeric("hourly_rate"), // Standard hourly rate
  overtimeRate: numeric("overtime_rate"), // Overtime hourly rate
  costRate: numeric("cost_rate"), // Internal cost rate
  weeklyCapacity: numeric("weekly_capacity").default(40), // Hours per week available
  availability: integer("availability").default(100), // Percentage availability (0-100)
  startDate: date("start_date"), // When resource started
  endDate: date("end_date"), // When resource contract ends (if applicable)
  isActive: boolean("is_active").default(true),
  isApprover: boolean("is_approver").default(false), // Can approve timesheets
  isIntakeApprover: boolean("is_intake_approver").default(false), // Can approve project intakes
  isBillable: boolean("is_billable").default(true), // Can be billed to clients
  timesheetHidden: boolean("timesheet_hidden").default(false), // Hide from all timesheet dashboards
  photoUrl: text("photo_url"), // Profile photo URL
  notes: text("notes"),
  invitedProjectIds: integer("invited_project_ids").array(), // Projects this resource was invited to (for team_member visibility)
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("resources_org_id_idx").on(table.organizationId),
  index("resources_user_id_idx").on(table.userId),
  index("resources_org_user_idx").on(table.organizationId, table.userId),
]);

// Task Resource Assignments (Join table)
export const taskResourceAssignments = pgTable("task_resource_assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  allocationPercentage: integer("allocation_percentage").default(100), // 0-100%
  role: text("role"), // Role in this specific task (e.g., "Lead", "Support")
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("tra_task_id_idx").on(table.taskId),
  index("tra_resource_id_idx").on(table.resourceId),
]);

// Issue Resource Assignments (Join table) - also handles risks since they're now in issues table
export const issueResourceAssignments = pgTable("issue_resource_assignments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  role: text("role"), // Role (e.g., "Assignee", "Reviewer", "Owner", "Mitigator")
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("ira_issue_id_idx").on(table.issueId),
  index("ira_resource_id_idx").on(table.resourceId),
]);

// Note: Risk Resource Assignments are now consolidated into Issue Resource Assignments
// The 'risk_resource_assignments' table is deprecated - use issue_resource_assignments instead

// Timesheet Entries (Time logging against tasks)
export const timesheetEntries = pgTable("timesheet_entries", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(), // The user logging time
  resourceId: integer("resource_id").references(() => resources.id).notNull(), // The resource record
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  entryDate: date("entry_date").notNull(), // The date for this time entry
  hours: numeric("hours").notNull(), // Hours worked (supports decimals like 0.25, 0.5)
  notes: text("notes"), // Optional notes for this entry
  status: text("status").default("Draft"), // Draft, Submitted, Approved, Rejected
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  proxyUserId: varchar("proxy_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("te_task_id_idx").on(table.taskId),
  index("te_resource_id_idx").on(table.resourceId),
  index("te_project_id_idx").on(table.projectId),
  index("te_organization_id_idx").on(table.organizationId),
  index("te_user_org_date_idx").on(table.userId, table.organizationId, table.entryDate),
  index("te_resource_task_date_idx").on(table.resourceId, table.taskId, table.entryDate),
]);

// Time Categories (for non-project time like vacation, PTO, etc.)
export const timeCategories = pgTable("time_categories", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "Vacation", "PTO", "Sick Leave"
  code: text("code"), // Short code like "VAC", "PTO", "SICK"
  description: text("description"),
  color: text("color").default("#6366f1"), // Color for UI display
  isActive: boolean("is_active").default(true),
  isPaidTime: boolean("is_paid_time").default(true), // Whether this counts as paid time
  requiresApproval: boolean("requires_approval").default(true),
  maxHoursPerYear: numeric("max_hours_per_year"),
  isBillable: boolean("is_billable").default(false),
  displayOrder: integer("display_order").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertTimeCategorySchema = createInsertSchema(timeCategories).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export type InsertTimeCategory = z.infer<typeof insertTimeCategorySchema>;
export type TimeCategory = typeof timeCategories.$inferSelect;

// Non-Project Time Entries (for vacation, PTO, etc.)
export const nonProjectTimeEntries = pgTable("non_project_time_entries", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  categoryId: integer("category_id").references(() => timeCategories.id).notNull(),
  entryDate: date("entry_date").notNull(),
  hours: numeric("hours").notNull(),
  description: text("description"),
  notes: text("notes"),
  isBillable: boolean("is_billable").default(false),
  status: text("status").default("Draft"),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
});

export const insertNonProjectTimeEntrySchema = createInsertSchema(nonProjectTimeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  approvedAt: true,
});
export type InsertNonProjectTimeEntry = z.infer<typeof insertNonProjectTimeEntrySchema>;
export type NonProjectTimeEntry = typeof nonProjectTimeEntries.$inferSelect;

// Timesheet Periods (for closing/locking time periods)
export const timesheetPeriods = pgTable("timesheet_periods", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "January 2024", "Week 1 - 2024"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").default("open").notNull(), // open, closed
  closedBy: varchar("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  reopenedBy: varchar("reopened_by").references(() => users.id),
  reopenedAt: timestamp("reopened_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertTimesheetPeriodSchema = createInsertSchema(timesheetPeriods).omit({
  id: true,
  createdAt: true,
  closedAt: true,
  reopenedAt: true,
});
export type InsertTimesheetPeriod = z.infer<typeof insertTimesheetPeriodSchema>;
export type TimesheetPeriod = typeof timesheetPeriods.$inferSelect;

export const timesheetSettings = pgTable("timesheet_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  minWeeklyHours: numeric("min_weekly_hours").default(0),
  maxWeeklyHours: numeric("max_weekly_hours").default(50),
  overtimeThreshold: numeric("overtime_threshold").default(40),
  gracePeriodDays: integer("grace_period_days").default(0),
  mandatoryNotes: boolean("mandatory_notes").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ts_settings_org_idx").on(table.organizationId),
]);

export const insertTimesheetSettingsSchema = createInsertSchema(timesheetSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetSettings = z.infer<typeof insertTimesheetSettingsSchema>;
export type TimesheetSettings = typeof timesheetSettings.$inferSelect;

export const timesheetAuditLog = pgTable("timesheet_audit_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  entryId: integer("entry_id"),
  action: text("action").notNull(),
  actorId: varchar("actor_id").references(() => users.id).notNull(),
  targetUserId: varchar("target_user_id").references(() => users.id),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ts_audit_entry_idx").on(table.entryId),
  index("ts_audit_org_idx").on(table.organizationId),
  index("ts_audit_actor_idx").on(table.actorId),
  index("ts_audit_created_idx").on(table.createdAt),
]);

export const insertTimesheetAuditLogSchema = createInsertSchema(timesheetAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertTimesheetAuditLog = z.infer<typeof insertTimesheetAuditLogSchema>;
export type TimesheetAuditLog = typeof timesheetAuditLog.$inferSelect;

export const approvalDelegations = pgTable("approval_delegations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  delegatorId: varchar("delegator_id").references(() => users.id).notNull(),
  delegateId: varchar("delegate_id").references(() => users.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("ad_org_idx").on(table.organizationId),
  index("ad_delegator_idx").on(table.delegatorId),
  index("ad_delegate_idx").on(table.delegateId),
]);

export const insertApprovalDelegationSchema = createInsertSchema(approvalDelegations).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});
export type InsertApprovalDelegation = z.infer<typeof insertApprovalDelegationSchema>;
export type ApprovalDelegation = typeof approvalDelegations.$inferSelect;

export const rejectionTemplates = pgTable("rejection_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  text: text("text").notNull(),
  category: text("category").default("General"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("rt_org_idx").on(table.organizationId),
]);

export const insertRejectionTemplateSchema = createInsertSchema(rejectionTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRejectionTemplate = z.infer<typeof insertRejectionTemplateSchema>;
export type RejectionTemplate = typeof rejectionTemplates.$inferSelect;

export const timesheetComments = pgTable("timesheet_comments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  entryId: integer("entry_id").references(() => timesheetEntries.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  text: text("text").notNull(),
  commentType: text("comment_type").default("comment"),
  statusFrom: text("status_from"),
  statusTo: text("status_to"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tc_entry_idx").on(table.entryId),
  index("tc_org_idx").on(table.organizationId),
]);

export const insertTimesheetCommentSchema = createInsertSchema(timesheetComments).omit({
  id: true,
  createdAt: true,
});
export type InsertTimesheetComment = z.infer<typeof insertTimesheetCommentSchema>;
export type TimesheetComment = typeof timesheetComments.$inferSelect;

export const timesheetReminderSettings = pgTable("timesheet_reminder_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  enabled: boolean("enabled").default(true),
  emailEnabled: boolean("email_enabled").default(true),
  notificationEnabled: boolean("notification_enabled").default(true),
  submissionReminderDays: jsonb("submission_reminder_days").$type<number[]>().default([4, 5, 8]),
  approvalReminderDays: integer("approval_reminder_days").default(2),
  escalationThresholdDays: integer("escalation_threshold_days").default(5),
  frequencyCap: integer("frequency_cap").default(3),
  digestEnabled: boolean("digest_enabled").default(true),
  digestDay: integer("digest_day").default(1),
  scheduledHour: integer("scheduled_hour").default(9),
  scheduledMinute: integer("scheduled_minute").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("trs_org_idx").on(table.organizationId),
]);

export const insertTimesheetReminderSettingsSchema = createInsertSchema(timesheetReminderSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetReminderSettings = z.infer<typeof insertTimesheetReminderSettingsSchema>;
export type TimesheetReminderSettings = typeof timesheetReminderSettings.$inferSelect;

export const timesheetReminderLog = pgTable("timesheet_reminder_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  reminderType: text("reminder_type").notNull(),
  weekStart: date("week_start").notNull(),
  urgencyLevel: text("urgency_level").default("friendly"),
  emailSent: boolean("email_sent").default(false),
  notificationCreated: boolean("notification_created").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trl_org_idx").on(table.organizationId),
  index("trl_user_week_idx").on(table.userId, table.weekStart),
]);

export type TimesheetReminderLog = typeof timesheetReminderLog.$inferSelect;

export const timesheetReminderSnooze = pgTable("timesheet_reminder_snooze", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  weekStart: date("week_start").notNull(),
  snoozedUntil: timestamp("snoozed_until").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trsnz_user_week_idx").on(table.userId, table.weekStart),
]);

export type TimesheetReminderSnooze = typeof timesheetReminderSnooze.$inferSelect;

export const timesheetEscalationLog = pgTable("timesheet_escalation_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  entryUserId: varchar("entry_user_id").references(() => users.id).notNull(),
  managerId: varchar("manager_id").references(() => users.id),
  escalatedToId: varchar("escalated_to_id").references(() => users.id),
  weekStart: date("week_start").notNull(),
  reason: text("reason"),
  emailSent: boolean("email_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tel_org_idx").on(table.organizationId),
  index("tel_user_week_idx").on(table.entryUserId, table.weekStart),
]);

export type TimesheetEscalationLog = typeof timesheetEscalationLog.$inferSelect;

// Change Requests (Project change control)
export const changeRequests = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  requestNumber: text("request_number"), // Auto-generated CR number (e.g., "CR-001")
  title: text("title").notNull(),
  description: text("description"),
  justification: text("justification"), // Business justification for the change
  type: text("type").default("Scope"), // Scope, Schedule, Budget, Resource, Quality
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  status: text("status").default("Draft"), // Draft, Submitted, Under Review, Approved, Rejected, Implemented
  impact: text("impact"), // Description of impact on project
  requestedBy: text("requested_by"), // Name of requester
  requestedDate: date("requested_date"),
  reviewedBy: text("reviewed_by"), // Name of reviewer/approver
  reviewedDate: date("reviewed_date"),
  implementedDate: date("implemented_date"),
  estimatedCost: numeric("estimated_cost"), // Cost impact of the change
  estimatedEffort: text("estimated_effort"), // Effort estimate (e.g., "5 days")
  affectedAreas: text("affected_areas"), // Comma-separated list of affected areas
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
});

// Project Documents (Documentation management)
export const projectDocuments = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").default("General"), // Charter, Plan, Requirements, Design, Test, Training, General
  category: text("category"), // Project Management, Technical, Business, Compliance
  version: text("version").default("1.0"),
  status: text("status").default("Draft"), // Draft, In Review, Approved, Archived
  fileName: text("file_name"), // Original file name if uploaded
  fileUrl: text("file_url"), // URL/path to the document
  fileSize: integer("file_size"), // Size in bytes
  mimeType: text("mime_type"), // File MIME type
  content: text("content"), // For text-based documents, store content directly
  author: text("author"), // Document author
  owner: text("owner"), // Document owner/maintainer
  reviewedBy: text("reviewed_by"),
  reviewedDate: date("reviewed_date"),
  approvedBy: text("approved_by"),
  approvedDate: date("approved_date"),
  expiresAt: date("expires_at"), // Optional expiration date
  tags: text("tags"), // Comma-separated tags for categorization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("project_documents_project_id_idx").on(table.projectId),
]);

// Project Comments (Notes feed for project discussions)
export const projectComments = pgTable("project_comments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  parentId: integer("parent_id"), // For threaded replies - references another comment
  content: text("content").notNull(),
  authorId: varchar("author_id").references(() => users.id),
  authorName: text("author_name"), // Stored for display even if user is deleted
  mentions: text("mentions").array(), // Array of user IDs mentioned with @
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("project_comments_project_id_idx").on(table.projectId),
]);

// Notification types:
// - mention: @mention in a comment
// - comment_reply: reply to user's comment
// - task_overdue: task past its end date
// - task_deadline_warning: task deadline approaching (3 days or less)
// - project_health_alert: project health changed to Red or at risk
// - portfolio_health_alert: portfolio has multiple red projects
// - task_assignment: user assigned to a task
// - risk_assignment: user assigned to a risk
// - issue_assignment: user assigned to an issue
// - project_assignment: user added to a project team
// - milestone_approaching: milestone deadline within 7 days
// - milestone_overdue: milestone past its target date
// - status_change: project/task status changed

// Notifications for @mentions and other events
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  taskId: integer("task_id").references(() => tasks.id),
  riskIssueId: integer("risk_issue_id"), // Polymorphic: can reference risks or issues
  milestoneId: integer("milestone_id").references(() => milestones.id),
  commentId: integer("comment_id").references(() => projectComments.id),
  fromUserId: varchar("from_user_id").references(() => users.id),
  fromUserName: text("from_user_name"),
  severity: text("severity").default("info"), // info, warning, critical
  actionUrl: text("action_url"), // deep link to the relevant item
  metadata: text("metadata"), // JSON string for additional context
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_organization_id_idx").on(table.organizationId),
  index("notifications_is_read_idx").on(table.isRead),
  index("notifications_created_at_idx").on(table.createdAt),
]);

// Status Report History (Weekly status reports archive)
export const statusReportHistory = pgTable("status_report_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  reportDate: date("report_date").notNull(), // The date the report covers
  weekNumber: integer("week_number"), // ISO week number for weekly tracking
  yearNumber: integer("year_number"), // Year for the week
  executiveSummary: text("executive_summary"),
  reportType: text("report_type").default("weekly"), // weekly, monthly, quarterly, adhoc
  recipientEmail: text("recipient_email"), // Who it was sent to
  sentAt: timestamp("sent_at"), // When the email was sent
  pdfFileUrl: text("pdf_file_url"), // URL to stored PDF in object storage
  pdfFileName: text("pdf_file_name"),
  // Snapshot data at time of report
  projectHealth: text("project_health"),
  projectStatus: text("project_status"),
  completionPercentage: integer("completion_percentage"),
  totalBudget: numeric("total_budget"),
  actualSpent: numeric("actual_spent"),
  forecastAmount: numeric("forecast_amount"),
  openRisksCount: integer("open_risks_count"),
  openIssuesCount: integer("open_issues_count"),
  completedMilestonesCount: integer("completed_milestones_count"),
  totalMilestonesCount: integer("total_milestones_count"),
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("status_report_history_project_id_idx").on(table.projectId),
]);

// Project Invoices for tracking billing
export const projectInvoices = pgTable("project_invoices", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  invoiceNumber: text("invoice_number"), // Invoice reference number
  title: text("title").notNull(), // Brief description
  description: text("description"), // Detailed description
  amount: numeric("amount").default(0), // Invoice amount
  currency: text("currency").default("USD"),
  status: text("status").default("Draft"), // Draft, Sent, Paid, Overdue, Cancelled
  invoiceDate: date("invoice_date"), // Date of invoice
  dueDate: date("due_date"), // Payment due date
  paidDate: date("paid_date"), // Actual payment date
  vendorName: text("vendor_name"), // Vendor or client name
  vendorEmail: text("vendor_email"),
  // File attachment fields
  fileName: text("file_name"), // Original file name if uploaded
  fileUrl: text("file_url"), // URL/path to the document in object storage
  fileSize: integer("file_size"), // Size in bytes
  mimeType: text("mime_type"), // File MIME type
  // External integration fields (for Dynamics 365, etc.)
  source: text("source"), // Source system: 'manual', 'dynamics365', etc.
  externalId: text("external_id"), // ID in the source system
  externalUrl: text("external_url"), // Direct URL to the invoice in source system
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("project_invoices_project_id_idx").on(table.projectId),
]);

// Invoice Notes (tracking notes with timestamps like billable status comments)
export const invoiceNotes = pgTable("invoice_notes", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => projectInvoices.id).notNull(),
  status: text("status"), // The invoice status at time of note
  note: text("note").notNull(),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"), // User's display name at time of note
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Financials (Budget/Plan/Actuals with CapEx/OpEx breakdown)
export const projectFinancials = pgTable("project_financials", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  category: text("category").notNull(), // "CapEx" or "OpEx"
  lineItem: text("line_item").notNull(), // Name of the expense item (e.g., "Hardware", "Software Licenses", "Consulting")
  description: text("description"),
  fiscalYear: integer("fiscal_year").notNull(), // e.g., 2025, 2026
  fiscalPeriod: text("fiscal_period"), // e.g., "Q1", "Q2", "Jan", "Full Year"
  budgetAmount: numeric("budget_amount").default(0), // Original budget/plan
  plannedAmount: numeric("planned_amount").default(0), // Current planned amount (may differ from original budget)
  actualAmount: numeric("actual_amount").default(0), // Actual spent
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
}, (table) => [
  index("project_financials_project_id_idx").on(table.projectId),
]);

// Cost Items (Hierarchical financial line items with monthly breakdown)
export const costItems = pgTable("cost_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  parentId: integer("parent_id"), // Self-reference for hierarchy (null = root level)
  name: text("name").notNull(), // Cost item name
  wbs: text("wbs"), // Work Breakdown Structure code
  comments: text("comments"),
  // Hierarchical grouping fields used by the Financials grid:
  // Financial View > Cost Category > Cost Specification > Cost Item
  financialView: text("financial_view"), // "Capital" | "Direct Expense" | "Labor"
  costCategory: text("cost_category"),
  costSpecification: text("cost_specification"),
  category: text("category"), // legacy: "Direct Expense", "Licenses", "Outside Services", "Travel/Meals", "Project Material", etc.
  fiscalYear: integer("fiscal_year").notNull(), // e.g., 2026
  // Annual totals
  aopTotal: numeric("aop_total").default(0), // Annual Operating Plan (original budget)
  fcstTotal: numeric("fcst_total").default(0), // Forecast total
  actTotal: numeric("act_total").default(0), // Actual total
  // Monthly AOP. M1..M12 are the 12 months of the org's fiscal year. The
  // calendar month of M1 is set on `organizations.fiscalYearStartMonth`
  // (default 10 = October, in which case M1=Oct .. M12=Sep).
  aopM1: numeric("aop_m1").default(0),
  aopM2: numeric("aop_m2").default(0),
  aopM3: numeric("aop_m3").default(0),
  aopM4: numeric("aop_m4").default(0),
  aopM5: numeric("aop_m5").default(0),
  aopM6: numeric("aop_m6").default(0),
  aopM7: numeric("aop_m7").default(0),
  aopM8: numeric("aop_m8").default(0),
  aopM9: numeric("aop_m9").default(0),
  aopM10: numeric("aop_m10").default(0),
  aopM11: numeric("aop_m11").default(0),
  aopM12: numeric("aop_m12").default(0),
  // Monthly forecasts
  fcstM1: numeric("fcst_m1").default(0), // October
  fcstM2: numeric("fcst_m2").default(0), // November
  fcstM3: numeric("fcst_m3").default(0), // December
  fcstM4: numeric("fcst_m4").default(0), // January
  fcstM5: numeric("fcst_m5").default(0), // February
  fcstM6: numeric("fcst_m6").default(0), // March
  fcstM7: numeric("fcst_m7").default(0), // April
  fcstM8: numeric("fcst_m8").default(0), // May
  fcstM9: numeric("fcst_m9").default(0), // June
  fcstM10: numeric("fcst_m10").default(0), // July
  fcstM11: numeric("fcst_m11").default(0), // August
  fcstM12: numeric("fcst_m12").default(0), // September
  // Monthly actuals
  actM1: numeric("act_m1").default(0),
  actM2: numeric("act_m2").default(0),
  actM3: numeric("act_m3").default(0),
  actM4: numeric("act_m4").default(0),
  actM5: numeric("act_m5").default(0),
  actM6: numeric("act_m6").default(0),
  actM7: numeric("act_m7").default(0),
  actM8: numeric("act_m8").default(0),
  actM9: numeric("act_m9").default(0),
  actM10: numeric("act_m10").default(0),
  actM11: numeric("act_m11").default(0),
  actM12: numeric("act_m12").default(0),
  sortOrder: integer("sort_order").default(0), // For manual ordering within parent
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("cost_items_project_id_idx").on(table.projectId),
]);
 
// Cost Item Change Logs (audit trail / undo support for financial entries)
// Note: `costItemId` is now used loosely — for normalized financial entries it is
// left null and the `previousValues`/`newValues` JSON carry the cell context
// (itemKey, scenario, month, dimensions, amount).
export const costItemChangeLogs = pgTable("cost_item_change_logs", {
  id: serial("id").primaryKey(),
  costItemId: integer("cost_item_id"),
  projectId: integer("project_id").references(() => projects.id),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(), // "cell" | "item_created" | "item_updated" | "item_deleted"
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"), // JSON string
  newValues: text("new_values"), // JSON string
  // Undo/redo state. `undone=true` means this change has been reverted and
  // sits on the redo stack. Any new edit truncates the redo stack by deleting
  // every row where undone=true for the project.
  undone: boolean("undone").default(false).notNull(),
}, (table) => [
  index("cost_item_change_logs_project_id_idx").on(table.projectId),
]);

// Financial Lockdowns — per-org, per-financial-type monthly close dates.
// Once a lockdown date is set for a given financial type, users cannot
// create or edit financial cells whose period (fiscal-year + month →
// calendar month-end) is on or before that date for that type.
export const financialLockdowns = pgTable("financial_lockdowns", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  financialTypeKey: text("financial_type_key").notNull(),
  lockdownDate: date("lockdown_date", { mode: "string" }).notNull(),
  note: text("note"),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("financial_lockdowns_org_idx").on(table.organizationId),
  index("financial_lockdowns_org_type_idx").on(table.organizationId, table.financialTypeKey),
]);

// Financial Entries — fully normalized fact table.
// One row per (project, fiscal year, scenario, month, logical item).
// All dimension fields are denormalized onto every row; rows that share the
// same `itemKey` represent the same logical item across all 36 cells
// (3 scenarios × 12 months).
export const financialEntries = pgTable("financial_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  // Calendar year of the cell (NOT the fiscal-year label). The FY label that
  // contains a row is derived at the API boundary using the org's
  // `fiscalYearStartMonth`, so values stay anchored to their original calendar
  // month even when an org admin changes the fiscal start month.
  fiscalYear: integer("fiscal_year").notNull(),
  scenario: text("scenario").notNull(), // "aop" | "fcst" | "act"
  // Calendar month (1=Jan .. 12=Dec). Storage is calendar-anchored; the
  // server translates to/from the org's fiscal-month index (M1..M12) using
  // `organizations.fiscalYearStartMonth` (default 10 = October).
  month: integer("month").notNull(),
  amount: numeric("amount").default(0).notNull(),
  // Logical-item identity (shared by every cell of one item)
  itemKey: text("item_key").notNull(),
  itemName: text("item_name").notNull(),
  // Dimension fields (denormalized, identical across rows of the same item)
  financialView: text("financial_view"),       // "Capital" | "Direct Expense" | "Labor"
  costCategory: text("cost_category"),
  costSpecification: text("cost_specification"),
  category: text("category"),                  // legacy free-form category
  wbs: text("wbs"),
  comments: text("comments"),
  sortOrder: integer("sort_order").default(0),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("financial_entries_project_year_idx").on(table.projectId, table.fiscalYear),
  index("financial_entries_item_key_idx").on(table.itemKey),
  uniqueIndex("financial_entries_cell_unique_idx").on(
    table.projectId, table.fiscalYear, table.itemKey, table.scenario, table.month,
  ),
]);

// Multi-Year WBS — fiscal year project rollup with SAP fields
export const multiYearWbs = pgTable("multi_year_wbs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  fiscalYear: text("fiscal_year").notNull(), // e.g. "FY24"
  sapProjectNumber: text("sap_project_number"),
  sapCapitalNumber: text("sap_capital_number"),
  sapExpenseNumber: text("sap_expense_number"),
  sapLaborNumber: text("sap_labor_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  createdBy: varchar("created_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("multi_year_wbs_project_id_idx").on(table.projectId),
]);

// Intake Types - Categorize intakes (e.g. "Default", "Power BI Request").
// `behavior` controls special handling: 'standard' = normal intake form,
// 'powerbi_redirect' = selecting this type sends the user to the Power BI agent
// instead of creating a normal intake row.
export const intakeTypes = pgTable("intake_types", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  behavior: text("behavior").notNull().default("standard"), // 'standard' | 'powerbi_redirect'
  isSystem: boolean("is_system").notNull().default(false), // seeded defaults that cannot be deleted
  isActive: boolean("is_active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_types_org_id_idx").on(table.organizationId),
]);
 
// Project Intakes (Intake workflow for new project ideas)
export const projectIntakes = pgTable("project_intakes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  intakeNumber: text("intake_number"), // Auto-generated intake ID (e.g., "INT-2026-001")
  workflowId: integer("workflow_id"), // FK to intake_workflows.id (nullable; assigned when org has multiple intake workflows)
  
  // Basic Information (Intake Form tab)
  projectName: text("project_name").notNull(),
  submitterId: varchar("submitter_id").references(() => users.id),
  description: text("description"),
  fundingSource: text("funding_source"), // "Business Funded", "IT Funded", "Shared", etc.
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  businessUnit: text("business_unit"), // BU field
  programId: integer("program_id"), // Reference to program (can be added later)
  programName: text("program_name"), // Stored program name for display
  
  // Workflow state
  currentStep: text("current_step").default("is_backlog"), // Workflow step
  status: text("status").default("draft"), // draft, in_progress, approved, rejected, cancelled
  
  // Step completion tracking
  isBacklogComplete: boolean("is_backlog_complete").default(false),
  basicInfoComplete: boolean("basic_info_complete").default(false),
  financialsComplete: boolean("financials_complete").default(false),
  projectCostComplete: boolean("project_cost_complete").default(false),
  cyberArchComplete: boolean("cyber_arch_complete").default(false),
  pmoSubmitted: boolean("pmo_submitted").default(false),
  pmoApproved: boolean("pmo_approved").default(false), // PM must approve before conversion to project
  pmoApprovedAt: timestamp("pmo_approved_at"),
  pmoApprovedBy: varchar("pmo_approved_by").references(() => users.id),
  
  // Financials tab data
  estimatedBudget: numeric("estimated_budget").default(0),
  capitalExpense: numeric("capital_expense").default(0),
  operatingExpense: numeric("operating_expense").default(0),
  financialJustification: text("financial_justification"),
  
  // Cyber and Architectural Evaluation tab
  cyberRiskAssessment: text("cyber_risk_assessment"),
  architecturalReview: text("architectural_review"),
  complianceRequirements: text("compliance_requirements"),
  securityApproval: boolean("security_approval"),
  securityApprovalDate: timestamp("security_approval_date"),
  securityApproverId: varchar("security_approver_id").references(() => users.id),
  
  // Project Cost Evaluation (IT) tab
  itCostEstimate: numeric("it_cost_estimate").default(0),
  resourceRequirements: text("resource_requirements"),
  implementationTimeline: text("implementation_timeline"),
  costBenefitAnalysis: text("cost_benefit_analysis"),
  
  // Approval tracking
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  
  // Created project reference (populated after approval)
  createdProjectId: integer("created_project_id").references(() => projects.id),
  
  // Meta
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("project_intakes_org_id_idx").on(table.organizationId),
  index("project_intakes_portfolio_id_idx").on(table.portfolioId),
]);

// Intake Workflows - Named intake workflow templates per organization
export const intakeWorkflows = pgTable("intake_workflows", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  creationMode: text("creation_mode").notNull().default("dialog"), // 'dialog' | 'url'
  creationUrl: text("creation_url"),
  // When set to 'powerbi', selecting this workflow opens the Power BI agent
  // instead of the standard intake dialog. null = standard intake behavior.
  agentTarget: text("agent_target"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_workflows_org_id_idx").on(table.organizationId),
  uniqueIndex("intake_workflows_one_default_per_org")
    .on(table.organizationId)
    .where(sql`${table.isDefault} = true`),
]);

// Intake Workflow Steps - Configurable workflow steps per organization
export const intakeWorkflowSteps = pgTable("intake_workflow_steps", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  workflowId: integer("workflow_id").references(() => intakeWorkflows.id, { onDelete: "cascade" }),
  stepKey: text("step_key").notNull(), // Canonical step identifier: intake_capture, triage, business_case, technical_evaluation, governance_review, decision
  position: integer("position").notNull(), // Order in workflow (0-5)
  label: text("label").notNull(), // Display name (can be customized per org)
  description: text("description"), // Short description
  helpText: text("help_text"), // Detailed help text shown during step
  requiredFields: text("required_fields").array(), // Array of field names required at this step
  notifyOnEntry: text("notify_on_entry").array(), // Email recipients notified when an intake enters this step
  notifyOnExit: text("notify_on_exit").array(), // Email recipients notified when an intake exits this step
  showFinancials: boolean("show_financials").default(false).notNull(), // Whether to render the Intake Estimates (CapEx/OpEx) grid on this step
  showArchitectureQuestions: boolean("show_architecture_questions").default(false).notNull(), // Whether to render the Architecture questionnaire grid on this step
  showCybersecurityQuestions: boolean("show_cybersecurity_questions").default(false).notNull(), // Whether to render the Cybersecurity questionnaire grid on this step
  isActive: boolean("is_active").default(true), // Whether step is active
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project Workflows - Named project lifecycle workflow templates per organization
export const projectWorkflows = pgTable("project_workflows", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  creationMode: text("creation_mode").notNull().default("dialog"), // 'dialog' | 'url'
  creationUrl: text("creation_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("project_workflows_org_id_idx").on(table.organizationId),
  uniqueIndex("project_workflows_one_default_per_org")
    .on(table.organizationId)
    .where(sql`${table.isDefault} = true`),
]);

// Project Workflow Steps - Configurable project lifecycle steps per workflow
export const projectWorkflowSteps = pgTable("project_workflow_steps", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  workflowId: integer("workflow_id").references(() => projectWorkflows.id, { onDelete: "cascade" }),
  stepKey: text("step_key").notNull(),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  isTerminal: boolean("is_terminal").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("project_workflow_steps_workflow_id_idx").on(table.workflowId),
]);

// Power BI Intake Requests - Captured via AI chat agent
export const powerbiIntakeRequests = pgTable("powerbi_intake_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  requestNumber: text("request_number"),
  submittedBy: varchar("submitted_by").references(() => users.id),
  status: text("status").default("new"),
  reportType: text("report_type"),
  reportName: text("report_name"),
  description: text("description"),
  numberOfPages: integer("number_of_pages"),
  numberOfDrillDownPages: integer("number_of_drill_down_pages"),
  numberOfDataSources: integer("number_of_data_sources"),
  dataSources: text("data_sources"),
  integrations: text("integrations"),
  calculationComplexity: text("calculation_complexity"),
  refreshFrequency: text("refresh_frequency"),
  filtersAndSlicers: text("filters_and_slicers"),
  visualRequirements: text("visual_requirements"),
  securityRequirements: text("security_requirements"),
  targetDeliveryDate: text("target_delivery_date"),
  additionalNotes: text("additional_notes"),
  conversationLog: text("conversation_log"),
  estimatedEffortHours: integer("estimated_effort_hours"),
  effortBreakdown: jsonb("effort_breakdown"),
  projectIntakeId: integer("project_intake_id").references(() => projectIntakes.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("powerbi_intake_org_id_idx").on(table.organizationId),
  uniqueIndex("powerbi_intake_request_number_idx").on(table.requestNumber),
]);

// Snapshot of intake fields extracted live from the Power BI Agent conversation.
// Each value is the model's current best-known capture (string for free-text, number
// for numeric counts) or null if not yet captured.
export type PbiIntakeState = {
  reportName: string | null;
  reportType: string | null;
  description: string | null;
  numberOfPages: number | null;
  numberOfDrillDownPages: number | null;
  dataSources: string | null;
  integrations: string | null;
  calculationComplexity: string | null;
  refreshFrequency: string | null;
  filtersAndSlicers: string | null;
  visualRequirements: string | null;
  securityRequirements: string | null;
  targetDeliveryDate: string | null;
  additionalNotes: string | null;
  submittedRequestNumber?: string | null;
  submittedIntakeNumber?: string | null;
  updatedAt?: string;
  // Field keys the user has manually edited in the side panel.
  // The extractor must not overwrite these on subsequent turns.
  editedFields?: string[];
  // Field keys whose current value originated from attachment analysis,
  // along with the source filename(s) to display ("from file: X").
  attachmentSourcedFields?: Record<string, string>;
};

// Structured analysis derived from documents the user attached to the agent chat.
export type PbiAttachmentAnalysis = {
  audienceTier: "executive" | "manager" | "analyst" | "mixed" | "unknown";
  audienceEvidence: string;
  documentTypes: string[];
  topics: string[];
  suggestedMetrics: string[];
  suggestedDimensions: string[];
  suggestedTimeGrain: string;
  suggestedRefreshCadence: string;
  suggestedDataSources: string[];
  openQuestions: string[];
  confidence: "low" | "medium" | "high";
  summary: string;
  sourceFiles: string[];
  attachmentIds: number[];
};

// Per-attachment text extraction stored alongside the user message that uploaded it.
export type PbiAttachmentExtraction = {
  name: string;
  objectPath: string;
  contentType: string;
  size: number;
  text: string | null;
  pageCount?: number;
  sheetCount?: number;
  detectedLanguage?: string;
  truncated?: boolean;
  error?: string;
};

// Power BI Agent Conversations - persistent chat history per user
export const powerbiAgentConversations = pgTable("powerbi_agent_conversations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title"),
  model: text("model").default("fast"),
  submittedIntakeId: integer("submitted_intake_id"),
  intakeState: jsonb("intake_state").$type<PbiIntakeState>(),
  archivedAt: timestamp("archived_at"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  attachmentAnalysis: jsonb("attachment_analysis").$type<PbiAttachmentAnalysis>(),
}, (table) => [
  index("pbi_agent_conv_user_idx").on(table.userId, table.lastMessageAt),
  index("pbi_agent_conv_org_idx").on(table.organizationId),
]);

export const powerbiAgentMessages = pgTable("powerbi_agent_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => powerbiAgentConversations.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments").$type<Array<{ name: string; objectPath: string; contentType: string; size: number }>>(),
  attachmentExtractions: jsonb("attachment_extractions").$type<PbiAttachmentExtraction[]>(),
  options: jsonb("options").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pbi_agent_msg_conv_idx").on(table.conversationId, table.createdAt),
]);

// Friday Agent Conversations - persistent chat history per user
export const fridayConversations = pgTable("friday_conversations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title"),
  archivedAt: timestamp("archived_at"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // When true, every reply Friday streams for this conversation includes
  // the onboarding directive (ONBOARDING_DEFAULT_PROMPT, super-admin
  // overridable via builtin_agent_settings) in the system prompt —
  // regardless of whether
  // the org is auto-detected as empty. Set by /api/jarvis/guest/adopt so a
  // visitor whose public-preview chat we just migrated keeps getting the
  // onboarding agent (offer to seed a workspace, ask about industry, etc.)
  // even on accounts whose org is no longer empty. Defaults to false; the
  // standard "Start onboarding agent" button still triggers per-message
  // forceOnboarding without touching this column.
  isOnboarding: boolean("is_onboarding").notNull().default(false),
}, (table) => [
  index("friday_conv_user_idx").on(table.userId, table.lastMessageAt),
  index("friday_conv_org_idx").on(table.organizationId),
]);

export const fridayMessages = pgTable("friday_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => fridayConversations.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments").$type<Array<{ name: string; type: string; size: number }>>(),
  pageContext: jsonb("page_context").$type<{ path?: string; entityType?: string; entityId?: number | string }>(),
  // Credits charged to produce this assistant reply, summed across every
  // streaming round (and tool call) that contributed to it. Stored in
  // hundredths of a credit so the value matches the credit ledger exactly
  // (e.g. 300 = 3.00 credits). Null/0 on user messages and on legacy rows
  // saved before per-reply credit tracking landed.
  creditsUsed: integer("credits_used"),
  // Per-message UI state that should survive a page reload / conversation
  // switch. Today this records the quick-reply chip the user picked on
  // an assistant message so the chips on that bubble can render with the
  // chosen option highlighted and the others muted. Null on legacy rows
  // and on every assistant message where no chip was clicked — the UI
  // treats null/missing as "no selection yet".
  metadata: jsonb("metadata").$type<{ quickReplySelection?: string }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("friday_msg_conv_idx").on(table.conversationId, table.createdAt),
]);

export type FridayConversation = typeof fridayConversations.$inferSelect;
export type FridayMessage = typeof fridayMessages.$inferSelect;

// Friday Guest Conversations - lightweight transcript store for visitors
// who land on the public /ai route without signing in. Holds at most a few
// messages per session and is reaped after the guest signs in (the
// transcript is migrated into a real `friday_conversations` row owned by
// the new user's org). No PII expected — guests are anonymous until they
// sign in. Indexed by `guestSessionId` (a random opaque token the client
// generates and stores in localStorage so the same browser keeps its
// transcript across refreshes).
export const fridayGuestConversations = pgTable("friday_guest_conversations", {
  id: serial("id").primaryKey(),
  guestSessionId: varchar("guest_session_id", { length: 64 }).notNull().unique(),
  // Total user messages this guest has sent — drives the 2-question cap
  // server-side. Incremented atomically before each model call so
  // concurrent requests can't slip past the limit.
  questionCount: integer("question_count").notNull().default(0),
  // Hashed IP + raw user agent are kept only for abuse triage; never
  // surfaced to clients. Hash so we don't store the raw IP.
  ipHash: varchar("ip_hash", { length: 64 }),
  userAgent: text("user_agent"),
  // Full transcript ({role, content, createdAt}[]) so the adoption endpoint
  // can replay it into friday_messages when the guest signs in.
  messages: jsonb("messages").$type<Array<{ role: "user" | "assistant"; content: string; createdAt: string }>>().notNull().default(sql`'[]'::jsonb`),
  // The 3rd question the guest tried to send AFTER the cap fired —
  // stashed so we can auto-send it as the first authenticated message.
  pendingQuestion: text("pending_question"),
  adoptedAt: timestamp("adopted_at"),
  adoptedByUserId: varchar("adopted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  adoptedConversationId: integer("adopted_conversation_id").references(() => fridayConversations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("friday_guest_conv_session_idx").on(table.guestSessionId),
  index("friday_guest_conv_created_idx").on(table.createdAt),
]);

export type FridayGuestConversation = typeof fridayGuestConversations.$inferSelect;

// Friday Saved Reports - persisted rich HTML reports the user explicitly
// saved from a Friday report card. Scoped to the organization so any member
// can re-open a report shared with the team.
export const fridaySavedReports = pgTable("friday_saved_reports", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  savedByUserId: varchar("saved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  generatedAt: timestamp("generated_at"),
  html: text("html").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Public sharing — when shareToken is set and not revoked/expired, the
  // report is reachable at /r/friday-report/{token} with no login required.
  // The token is rotated on each Share action and cleared on Revoke.
  shareToken: text("share_token"),
  sharedAt: timestamp("shared_at"),
  sharedByUserId: varchar("shared_by_user_id").references(() => users.id, { onDelete: "set null" }),
  shareExpiresAt: timestamp("share_expires_at"),
  shareRevokedAt: timestamp("share_revoked_at"),
}, (table) => [
  index("friday_saved_reports_org_idx").on(table.organizationId, table.createdAt),
  index("friday_saved_reports_user_idx").on(table.savedByUserId),
  uniqueIndex("friday_saved_reports_share_token_idx").on(table.shareToken),
]);

export type FridaySavedReport = typeof fridaySavedReports.$inferSelect;
export type InsertFridaySavedReport = typeof fridaySavedReports.$inferInsert;

// MPP Imports - Store imported Microsoft Project data
export const mppImports = pgTable("mpp_imports", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  projectId: integer("project_id").references(() => projects.id), // Optional link to existing project
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull().default("xml"), // "xml", "csv", "mpp"
  fileUrl: text("file_url"), // URL to the original uploaded file (in object storage)
  importedBy: varchar("imported_by").references(() => users.id),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  taskCount: integer("task_count").default(0),
  status: text("status").default("active"), // "active", "archived"
  createdAt: timestamp("created_at").defaultNow(),
});

// MPP Import Tasks - Individual tasks from MPP imports
export const mppImportTasks = pgTable("mpp_import_tasks", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").references(() => mppImports.id).notNull(),
  taskId: integer("task_id"), // Original task ID from the file
  wbs: text("wbs"), // Work Breakdown Structure code
  taskName: text("task_name").notNull(),
  startDate: date("start_date"),
  finishDate: date("finish_date"),
  duration: text("duration"), // Duration as text (e.g., "5 days")
  durationDays: numeric("duration_days"), // Duration in days (supports fractional)
  percentComplete: integer("percent_complete").default(0),
  outlineLevel: integer("outline_level").default(1), // Task hierarchy level
  parentTaskId: integer("parent_task_id"), // Parent task reference
  isSummary: boolean("is_summary").default(false), // Summary/parent task
  isMilestone: boolean("is_milestone").default(false),
  notes: text("notes"),
  workHours: numeric("work_hours"), // Work/effort in hours from MPP
  actualWorkHours: numeric("actual_work_hours"), // Actual work hours from MPP
  remainingWorkHours: numeric("remaining_work_hours"), // Remaining work hours from MPP
  cost: numeric("cost"), // Budgeted/planned total cost (from P6 TASKRSRC + TASKEXP target_cost or P6 XML PlannedCost)
  actualCost: numeric("actual_cost"), // Actual cost to date (P6 TASKRSRC act_reg+act_ot + TASKEXP act_cost)
  remainingCost: numeric("remaining_cost"), // Remaining cost (P6 TASKRSRC + TASKEXP remain_cost)
  predecessors: text("predecessors"), // JSON array of predecessor relationships [{predecessorTaskId, type, lagDays}]
  createdAt: timestamp("created_at").defaultNow(),
});

// Schedule Versions - Snapshot history for imported schedules (MS Project / Primavera P6)
export const scheduleVersions = pgTable("schedule_versions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  versionNumber: integer("version_number").notNull(),
  mppImportId: integer("mpp_import_id").references(() => mppImports.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull().default("xml"),
  fileUrl: text("file_url"),
  importedBy: varchar("imported_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  taskCount: integer("task_count").default(0),
  isCurrent: boolean("is_current").default(false),
  restoreOfVersionId: integer("restore_of_version_id"),
  summary: text("summary"),
}, (table) => [
  uniqueIndex("schedule_versions_project_version_idx").on(table.projectId, table.versionNumber),
]);

// Schedule Version Tasks - Snapshot of tasks captured at a particular version
export const scheduleVersionTasks = pgTable("schedule_version_tasks", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").references(() => scheduleVersions.id, { onDelete: "cascade" }).notNull(),
  externalId: integer("external_id"),
  wbs: text("wbs"),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  duration: text("duration"),
  durationDays: numeric("duration_days"),
  progress: integer("progress").default(0),
  status: text("status"),
  isSummary: boolean("is_summary").default(false),
  isMilestone: boolean("is_milestone").default(false),
  outlineLevel: integer("outline_level").default(1),
  parentExternalId: integer("parent_external_id"),
  predecessors: text("predecessors"),
  notes: text("notes"),
  workHours: numeric("work_hours"),
  actualWorkHours: numeric("actual_work_hours"),
  remainingWorkHours: numeric("remaining_work_hours"),
  taskIndex: integer("task_index").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization-specific integration settings
// Tokens are encrypted at rest via server/lib/tokenEncryption.ts
export const organizationIntegrations = pgTable("organization_integrations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  integrationType: text("integration_type").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  connectionStatus: text("connection_status").default("disconnected"),
  additionalData: text("additional_data"),
  connectedBy: text("connected_by"),
  connectedAt: timestamp("connected_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
}, (table) => [
  uniqueIndex("org_integrations_org_type_idx").on(table.organizationId, table.integrationType),
]);

// === RELATIONS ===

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  members: many(organizationMembers),
  portfolios: many(portfolios),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  managedPortfolios: many(portfolios, { relationName: "portfolioManager" }),
  managedProjects: many(projects, { relationName: "projectManager" }),
  organizationMemberships: many(organizationMembers),
  ownedOrganizations: many(organizations),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [portfolios.organizationId],
    references: [organizations.id],
  }),
  manager: one(users, {
    fields: [portfolios.managerId],
    references: [users.id],
    relationName: "portfolioManager"
  }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  portfolio: one(portfolios, {
    fields: [projects.portfolioId],
    references: [portfolios.id],
  }),
  manager: one(users, {
    fields: [projects.managerId],
    references: [users.id],
    relationName: "projectManager"
  }),
  milestones: many(milestones),
  issues: many(issues), // includes both issues and risks (via itemType field)
  tasks: many(tasks),
  financials: many(projectFinancials),
  costItems: many(costItems),
}));

export const projectFinancialsRelations = relations(projectFinancials, ({ one }) => ({
  project: one(projects, {
    fields: [projectFinancials.projectId],
    references: [projects.id],
  }),
}));

export const intakeFinancials = pgTable("intake_financials", {
  id: serial("id").primaryKey(),
  intakeId: integer("intake_id").references(() => projectIntakes.id, { onDelete: "cascade" }).notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  capexAmount: numeric("capex_amount").default(0).notNull(),
  opexAmount: numeric("opex_amount").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_financials_intake_id_idx").on(table.intakeId),
  uniqueIndex("intake_financials_intake_year_uniq").on(table.intakeId, table.fiscalYear),
]);

export const intakeFinancialsRelations = relations(intakeFinancials, ({ one }) => ({
  intake: one(projectIntakes, {
    fields: [intakeFinancials.intakeId],
    references: [projectIntakes.id],
  }),
}));

// Intake Governance Questions — Architecture & Cybersecurity questionnaire rows
// per intake. A single table with a `category` discriminator powers two visually
// distinct grids ("Questions from Architecture" / "Questions from Cybersecurity").
export const intakeGovernanceQuestions = pgTable("intake_governance_questions", {
  id: serial("id").primaryKey(),
  intakeId: integer("intake_id").references(() => projectIntakes.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(), // 'architecture' | 'cybersecurity'
  question: text("question").notNull(),
  answer: text("answer"), // 'yes' | 'no' | null (unanswered)
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_governance_questions_intake_id_idx").on(table.intakeId),
  index("intake_governance_questions_intake_category_idx").on(table.intakeId, table.category),
]);

export const intakeGovernanceQuestionsRelations = relations(intakeGovernanceQuestions, ({ one }) => ({
  intake: one(projectIntakes, {
    fields: [intakeGovernanceQuestions.intakeId],
    references: [projectIntakes.id],
  }),
}));

export const costItemsRelations = relations(costItems, ({ one }) => ({
  project: one(projects, {
    fields: [costItems.projectId],
    references: [projects.id],
  }),
}));

// =============== Configurable intake form tab layout (per organization) ===============
// Tabs ordered by `position` form the tab strip on the intake page. Each tab
// owns ordered sections; each section owns ordered items (a field, a custom
// field, or a composite "block" defined in shared/intakeFormRegistry.ts).
export const intakeTabs = pgTable("intake_tabs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  key: text("key").notNull(),     // stable slug used in URL/state
  label: text("label").notNull(),
  icon: text("icon"),             // lucide icon name
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_tabs_org_id_idx").on(table.organizationId),
]);

export const intakeTabSections = pgTable("intake_tab_sections", {
  id: serial("id").primaryKey(),
  tabId: integer("tab_id").references(() => intakeTabs.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_tab_sections_tab_id_idx").on(table.tabId),
]);

export const intakeTabItems = pgTable("intake_tab_items", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").references(() => intakeTabSections.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  itemType: text("item_type").notNull(),  // 'field' | 'custom_field' | 'block'
  itemKey: text("item_key").notNull(),    // field name, custom-field id (string), or block key
  width: text("width").default("full").notNull(), // 'full' | 'half' | 'third'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("intake_tab_items_section_id_idx").on(table.sectionId),
]);

export const intakeTabsRelations = relations(intakeTabs, ({ many }) => ({
  sections: many(intakeTabSections),
}));
export const intakeTabSectionsRelations = relations(intakeTabSections, ({ one, many }) => ({
  tab: one(intakeTabs, { fields: [intakeTabSections.tabId], references: [intakeTabs.id] }),
  items: many(intakeTabItems),
}));
export const intakeTabItemsRelations = relations(intakeTabItems, ({ one }) => ({
  section: one(intakeTabSections, { fields: [intakeTabItems.sectionId], references: [intakeTabSections.id] }),
}));

export type IntakeTab = typeof intakeTabs.$inferSelect;
export type InsertIntakeTab = typeof intakeTabs.$inferInsert;
export type IntakeTabSection = typeof intakeTabSections.$inferSelect;
export type InsertIntakeTabSection = typeof intakeTabSections.$inferInsert;
export type IntakeTabItem = typeof intakeTabItems.$inferSelect;
export type InsertIntakeTabItem = typeof intakeTabItems.$inferInsert;

// Nested DTO returned by the layout endpoint and accepted by the save endpoint.
export interface IntakeTabLayoutItemDTO {
  id?: number;
  itemType: "field" | "custom_field" | "block";
  itemKey: string;
  width: "full" | "half" | "third";
}
export interface IntakeTabLayoutSectionDTO {
  id?: number;
  title: string;
  description?: string | null;
  items: IntakeTabLayoutItemDTO[];
}
export interface IntakeTabLayoutTabDTO {
  id?: number;
  key: string;
  label: string;
  icon?: string | null;
  isActive?: boolean;
  sections: IntakeTabLayoutSectionDTO[];
}

export const projectIntakesRelations = relations(projectIntakes, ({ one }) => ({
  organization: one(organizations, {
    fields: [projectIntakes.organizationId],
    references: [organizations.id],
  }),
  portfolio: one(portfolios, {
    fields: [projectIntakes.portfolioId],
    references: [portfolios.id],
  }),
  submitter: one(users, {
    fields: [projectIntakes.submitterId],
    references: [users.id],
  }),
  createdProject: one(projects, {
    fields: [projectIntakes.createdProjectId],
    references: [projects.id],
  }),
}));

// Note: risksRelations removed - risks are now in issues table with itemType="risk"

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  project: one(projects, {
    fields: [changeRequests.projectId],
    references: [projects.id],
  }),
}));

export const projectDocumentsRelations = relations(projectDocuments, ({ one }) => ({
  project: one(projects, {
    fields: [projectDocuments.projectId],
    references: [projects.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  changeLogs: many(taskChangeLogs),
  dependencies: many(taskDependencies, { relationName: "taskDependencies" }),
  dependentOn: many(taskDependencies, { relationName: "taskDependentOn" }),
  resourceAssignments: many(taskResourceAssignments),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [resources.organizationId],
    references: [organizations.id],
  }),
  taskAssignments: many(taskResourceAssignments),
  issueAssignments: many(issueResourceAssignments), // includes both issue and risk resource assignments
}));

export const taskResourceAssignmentsRelations = relations(taskResourceAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskResourceAssignments.taskId],
    references: [tasks.id],
  }),
  resource: one(resources, {
    fields: [taskResourceAssignments.resourceId],
    references: [resources.id],
  }),
}));

export const issueResourceAssignmentsRelations = relations(issueResourceAssignments, ({ one }) => ({
  issue: one(issues, {
    fields: [issueResourceAssignments.issueId],
    references: [issues.id],
  }),
  resource: one(resources, {
    fields: [issueResourceAssignments.resourceId],
    references: [resources.id],
  }),
}));

// Note: riskResourceAssignmentsRelations removed - risk assignments are now in issueResourceAssignments

export const taskChangeLogsRelations = relations(taskChangeLogs, ({ one }) => ({
  task: one(tasks, {
    fields: [taskChangeLogs.taskId],
    references: [tasks.id],
  }),
  changedByUser: one(users, {
    fields: [taskChangeLogs.changedBy],
    references: [users.id],
  }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: "taskDependencies",
  }),
  dependsOnTask: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: "taskDependentOn",
  }),
}));

// === SCHEMAS ===

// insertUserSchema is now handled by models/auth types or we create one here for other uses
// But we should use the one from auth if possible, or create a new one for specific app usage
// replit auth uses UpsertUser type. 
// Let's define a schema for our app's user usage if needed, but mainly we use the auth one.
// createInsertSchema(users) would work.

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({ id: true, createdAt: true });
export const insertOrganizationInviteSchema = createInsertSchema(organizationInvites).omit({ id: true, createdAt: true, acceptedAt: true });
export const insertOrganizationAccessRequestSchema = createInsertSchema(organizationAccessRequests).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertExternalShareSchema = createInsertSchema(externalShares).omit({ id: true, sharedAt: true });
export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Portfolio name is required"),
});
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true, updatedBy: true, createdBy: true });
// Risk schema is now an alias for Issue schema with itemType="risk"
// Extend to handle date strings for escalatedAt field
const baseRiskSchema = createInsertSchema(issues).omit({ id: true, createdAt: true });
export const insertRiskSchema = baseRiskSchema.extend({
  escalatedAt: z.union([z.date(), z.string().transform(s => s ? new Date(s) : null), z.null()]).optional(),
  // Force itemType to "risk" so the shared issues table cannot be used to insert
  // non-risk rows through the risk endpoints.
  itemType: z.literal("risk").default("risk"),
  // Risks share the issues table, but `issues.type` is an issue-only enum
  // (Bug, Enhancement, etc.) with DB default "Bug". Forbid clients from
  // smuggling a value here; the storage layer (`projectStorage.createRisk`)
  // explicitly writes type=null so the DB default can't pollute risk rows.
  type: z.null().optional(),
  // Enforce canonical enum values so callers cannot persist arbitrary strings
  // for status or priority. Both columns are nullable in the DB and have
  // defaults, so we keep them nullable + optional here.
  status: enumWithMessage(RISK_STATUSES, "status").nullable().optional(),
  priority: enumWithMessage(RISK_PRIORITIES, "priority").nullable().optional(),
});
/** @deprecated Renamed to Portfolio Key Dates. Schema kept for backward compatibility. */
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true }).extend({
  // Normalize legacy 'Done' status (used by older clients & older demo data) to
  // the canonical 'Completed' value used everywhere else in the codebase. This
  // preserves backward compatibility with clients that were built before the
  // milestoneStatus enum was unified.
  status: z.preprocess(
    (val) => (val === 'Done' ? 'Completed' : val),
    z.string().nullable().optional(),
  ),
});
export const insertPortfolioKeyDateSchema = createInsertSchema(portfolioKeyDates).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true, deletedBy: true, isDemo: true });
export const updatePortfolioKeyDateSchema = insertPortfolioKeyDateSchema.pick({ title: true, description: true, keyDateType: true, date: true, status: true, completed: true, notes: true }).partial();
// Extend to handle date strings for escalatedAt field
const baseIssueSchema = createInsertSchema(issues).omit({ id: true, createdAt: true });
export const insertIssueSchema = baseIssueSchema.extend({
  escalatedAt: z.union([z.date(), z.string().transform(s => s ? new Date(s) : null), z.null()]).optional(),
  type: issueTypeEnum.default("Bug").optional(),
  // Enforce canonical enum values so callers cannot persist arbitrary strings
  // for status or priority. Both columns are nullable in the DB and have
  // defaults, so we keep them nullable + optional here.
  status: enumWithMessage(ISSUE_STATUSES, "status").nullable().optional(),
  priority: enumWithMessage(ISSUE_PRIORITIES, "priority").nullable().optional(),
});
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true }).extend({
  durationDays: z.number().min(0).max(36500).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isOngoing: z.boolean().optional(),
  schedulingMode: z.enum(['auto', 'manual']).optional(),
  // Enforce canonical enum values so callers cannot persist arbitrary strings
  // for status or priority. Both columns are nullable in the DB and have
  // defaults, so we keep them nullable + optional here.
  status: enumWithMessage(TASK_STATUSES, "status").nullable().optional(),
  priority: enumWithMessage(TASK_PRIORITIES, "priority").nullable().optional(),
});
export const insertTaskChangeLogSchema = createInsertSchema(taskChangeLogs).omit({ id: true, changedAt: true });
export const insertTaskNotesHistorySchema = createInsertSchema(taskNotesHistory).omit({ id: true, changedAt: true });
export const insertProjectChangeLogSchema = createInsertSchema(projectChangeLogs).omit({ id: true, changedAt: true });
export const insertIssueChangeLogSchema = createInsertSchema(issueChangeLogs).omit({ id: true, changedAt: true });
// Risk change logs are now handled through issue change logs
export const insertRiskChangeLogSchema = insertIssueChangeLogSchema;
export const insertTaskDependencySchema = createInsertSchema(taskDependencies).omit({ id: true, createdAt: true });
export const insertProjectFinancialSchema = createInsertSchema(projectFinancials).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIntakeFinancialSchema = createInsertSchema(intakeFinancials).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIntakeGovernanceQuestionSchema = createInsertSchema(intakeGovernanceQuestions, {
  category: z.enum(["architecture", "cybersecurity"]),
  question: z.string().min(1, "Question is required"),
  answer: z.enum(["yes", "no"]).nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertResourceSchema = createInsertSchema(resources).omit({ id: true, createdAt: true });
export const insertTaskResourceAssignmentSchema = createInsertSchema(taskResourceAssignments).omit({ id: true, createdAt: true });
export const insertIssueResourceAssignmentSchema = createInsertSchema(issueResourceAssignments).omit({ id: true, createdAt: true });
// Risk resource assignments are now handled through issue resource assignments
export const insertRiskResourceAssignmentSchema = insertIssueResourceAssignmentSchema;
export const insertTimesheetEntrySchema = createInsertSchema(timesheetEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCostItemSchema = createInsertSchema(costItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCostItemChangeLogSchema = createInsertSchema(costItemChangeLogs).omit({ id: true, changedAt: true });
export const insertFinancialEntrySchema = createInsertSchema(financialEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFinancialLockdownSchema = createInsertSchema(financialLockdowns).omit({ id: true, createdAt: true, updatedAt: true });
export const financialLockdownInputSchema = z.object({
  financialTypeKey: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/),
  lockdownDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "lockdownDate must be YYYY-MM-DD"),
  note: z.string().max(500).nullish(),
});
export const insertMultiYearWbsSchema = createInsertSchema(multiYearWbs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectIntakeSchema = createInsertSchema(projectIntakes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMppImportSchema = createInsertSchema(mppImports).omit({ id: true, createdAt: true, lastSyncedAt: true });
export const insertMppImportTaskSchema = createInsertSchema(mppImportTasks).omit({ id: true, createdAt: true });
export const insertScheduleVersionSchema = createInsertSchema(scheduleVersions).omit({ id: true, createdAt: true });
export const insertScheduleVersionTaskSchema = createInsertSchema(scheduleVersionTasks).omit({ id: true, createdAt: true });
export const insertChangeRequestSchema = createInsertSchema(changeRequests).omit({ id: true, createdAt: true });
export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({ id: true, createdAt: true, updatedAt: true });

export const insertProjectCommentSchema = createInsertSchema(projectComments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBillableStatusCommentSchema = createInsertSchema(billableStatusComments).omit({ id: true, createdAt: true });
export const insertHealthStatusHistorySchema = createInsertSchema(healthStatusHistory).omit({ id: true, createdAt: true });
export const insertProjectInvoiceSchema = createInsertSchema(projectInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceNoteSchema = createInsertSchema(invoiceNotes).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertStatusReportHistorySchema = createInsertSchema(statusReportHistory).omit({ id: true, createdAt: true });
export const insertIntakeWorkflowStepSchema = createInsertSchema(intakeWorkflowSteps).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIntakeWorkflowSchema = createInsertSchema(intakeWorkflows).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectWorkflowSchema = createInsertSchema(projectWorkflows).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectWorkflowStepSchema = createInsertSchema(projectWorkflowSteps).omit({ id: true, createdAt: true, updatedAt: true });

// === TYPES ===

// User types exported from models/auth

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

export type OrganizationInvite = typeof organizationInvites.$inferSelect;
export type InsertOrganizationInvite = z.infer<typeof insertOrganizationInviteSchema>;

export type OrganizationAccessRequest = typeof organizationAccessRequests.$inferSelect;
export type InsertOrganizationAccessRequest = z.infer<typeof insertOrganizationAccessRequestSchema>;

export type ExternalShare = typeof externalShares.$inferSelect;
export type InsertExternalShare = z.infer<typeof insertExternalShareSchema>;

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type CustomPortfolioProject = typeof customPortfolioProjects.$inferSelect;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

/** @deprecated Renamed to PortfolioKeyDate. Alias kept for backward compatibility. */
export type Milestone = typeof milestones.$inferSelect;
/** @deprecated Renamed to InsertPortfolioKeyDate. Alias kept for backward compatibility. */
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

export type PortfolioKeyDate = typeof portfolioKeyDates.$inferSelect;
export type InsertPortfolioKeyDate = z.infer<typeof insertPortfolioKeyDateSchema>;
export type UpdatePortfolioKeyDateRequest = Partial<InsertPortfolioKeyDate>;

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = z.infer<typeof insertIssueSchema>;

// Risk is now an alias for Issue with itemType="risk"
export type Risk = Issue;
export type InsertRisk = InsertIssue;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskChangeLog = typeof taskChangeLogs.$inferSelect;
export type InsertTaskChangeLog = z.infer<typeof insertTaskChangeLogSchema>;

export type TaskNotesHistoryEntry = typeof taskNotesHistory.$inferSelect;
export type InsertTaskNotesHistory = z.infer<typeof insertTaskNotesHistorySchema>;

export type ProjectChangeLog = typeof projectChangeLogs.$inferSelect;
export type InsertProjectChangeLog = z.infer<typeof insertProjectChangeLogSchema>;

export type IssueChangeLog = typeof issueChangeLogs.$inferSelect;
export type InsertIssueChangeLog = z.infer<typeof insertIssueChangeLogSchema>;

// Risk change logs are now handled through issue change logs
export type RiskChangeLog = IssueChangeLog;
export type InsertRiskChangeLog = InsertIssueChangeLog;

export type TaskDependency = typeof taskDependencies.$inferSelect;
export type InsertTaskDependency = z.infer<typeof insertTaskDependencySchema>;

export type ProjectFinancial = typeof projectFinancials.$inferSelect;
export type InsertProjectFinancial = z.infer<typeof insertProjectFinancialSchema>;

export type IntakeFinancial = typeof intakeFinancials.$inferSelect;
export type InsertIntakeFinancial = z.infer<typeof insertIntakeFinancialSchema>;
export type UpdateIntakeFinancialRequest = Partial<InsertIntakeFinancial>;
export type IntakeGovernanceQuestion = typeof intakeGovernanceQuestions.$inferSelect;
export type InsertIntakeGovernanceQuestion = z.infer<typeof insertIntakeGovernanceQuestionSchema>;
export type UpdateIntakeGovernanceQuestionRequest = Partial<InsertIntakeGovernanceQuestion>;
export type IntakeGovernanceCategory = "architecture" | "cybersecurity";

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;

export type TaskResourceAssignment = typeof taskResourceAssignments.$inferSelect;
export type InsertTaskResourceAssignment = z.infer<typeof insertTaskResourceAssignmentSchema>;

export type IssueResourceAssignment = typeof issueResourceAssignments.$inferSelect;
export type InsertIssueResourceAssignment = z.infer<typeof insertIssueResourceAssignmentSchema>;

// Risk resource assignments are now handled through issue resource assignments  
export type RiskResourceAssignment = IssueResourceAssignment;
export type InsertRiskResourceAssignment = InsertIssueResourceAssignment;

export type TimesheetEntry = typeof timesheetEntries.$inferSelect;
export type InsertTimesheetEntry = z.infer<typeof insertTimesheetEntrySchema>;

export type CostItem = typeof costItems.$inferSelect;
export type InsertCostItem = z.infer<typeof insertCostItemSchema>;

export type CostItemChangeLog = typeof costItemChangeLogs.$inferSelect;
export type InsertCostItemChangeLog = z.infer<typeof insertCostItemChangeLogSchema>;

export type FinancialEntry = typeof financialEntries.$inferSelect;
export type InsertFinancialEntry = z.infer<typeof insertFinancialEntrySchema>;

export type FinancialLockdown = typeof financialLockdowns.$inferSelect;
export type InsertFinancialLockdown = z.infer<typeof insertFinancialLockdownSchema>;
export type FinancialLockdownInput = z.infer<typeof financialLockdownInputSchema>;

export type MultiYearWbs = typeof multiYearWbs.$inferSelect;
export type InsertMultiYearWbs = z.infer<typeof insertMultiYearWbsSchema>;

export type ProjectIntake = typeof projectIntakes.$inferSelect;
export type InsertProjectIntake = z.infer<typeof insertProjectIntakeSchema>;

export type MppImport = typeof mppImports.$inferSelect;
export type InsertMppImport = z.infer<typeof insertMppImportSchema>;

export type MppImportTask = typeof mppImportTasks.$inferSelect;
export type InsertMppImportTask = z.infer<typeof insertMppImportTaskSchema>;

export type ScheduleVersion = typeof scheduleVersions.$inferSelect;
export type InsertScheduleVersion = z.infer<typeof insertScheduleVersionSchema>;

export type ScheduleVersionTask = typeof scheduleVersionTasks.$inferSelect;
export type InsertScheduleVersionTask = z.infer<typeof insertScheduleVersionTaskSchema>;

export type ChangeRequest = typeof changeRequests.$inferSelect;
export type InsertChangeRequest = z.infer<typeof insertChangeRequestSchema>;

export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

export type ProjectComment = typeof projectComments.$inferSelect;
export type InsertProjectComment = z.infer<typeof insertProjectCommentSchema>;

export type BillableStatusComment = typeof billableStatusComments.$inferSelect;
export type InsertBillableStatusComment = z.infer<typeof insertBillableStatusCommentSchema>;

export type HealthStatusHistory = typeof healthStatusHistory.$inferSelect;
export type InsertHealthStatusHistory = z.infer<typeof insertHealthStatusHistorySchema>;

export type ProjectInvoice = typeof projectInvoices.$inferSelect;
export type InsertProjectInvoice = z.infer<typeof insertProjectInvoiceSchema>;

export type InvoiceNote = typeof invoiceNotes.$inferSelect;
export type InsertInvoiceNote = z.infer<typeof insertInvoiceNoteSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type StatusReportHistory = typeof statusReportHistory.$inferSelect;
export type InsertStatusReportHistory = z.infer<typeof insertStatusReportHistorySchema>;

export type IntakeWorkflowStep = typeof intakeWorkflowSteps.$inferSelect;
export type ProjectWorkflowStep = typeof projectWorkflowSteps.$inferSelect;
export type InsertIntakeWorkflowStep = z.infer<typeof insertIntakeWorkflowStepSchema>;
export type IntakeWorkflow = typeof intakeWorkflows.$inferSelect;
export type InsertIntakeWorkflow = z.infer<typeof insertIntakeWorkflowSchema>;
export type ProjectWorkflow = typeof projectWorkflows.$inferSelect;
export type InsertProjectWorkflow = z.infer<typeof insertProjectWorkflowSchema>;
export type InsertProjectWorkflowStep = z.infer<typeof insertProjectWorkflowStepSchema>;

// API Request/Response Types
export type CreatePortfolioRequest = InsertPortfolio;
export type UpdatePortfolioRequest = Partial<InsertPortfolio>;

export type CreateProjectRequest = InsertProject;
export type UpdateProjectRequest = Partial<InsertProject> & { 
  completionPercentage?: number;
  health?: string;
};

export type CreateRiskRequest = InsertRisk;
export type UpdateRiskRequest = Partial<InsertRisk>;

/** @deprecated Use InsertPortfolioKeyDate from the portfolioKeyDates table instead. */
export type CreateMilestoneRequest = InsertMilestone;
/** @deprecated Use UpdatePortfolioKeyDateRequest from the portfolioKeyDates table instead. */
export type UpdateMilestoneRequest = Partial<InsertMilestone>;

export type CreateIssueRequest = InsertIssue;
export type UpdateIssueRequest = Partial<InsertIssue>;

export type CreateTaskRequest = InsertTask;
export type UpdateTaskRequest = Partial<InsertTask>;

export type CreateProjectFinancialRequest = InsertProjectFinancial;
export type UpdateProjectFinancialRequest = Partial<InsertProjectFinancial>;

export type CreateResourceRequest = InsertResource;
export type UpdateResourceRequest = Partial<InsertResource>;

export type CreateCostItemRequest = InsertCostItem;
export type UpdateCostItemRequest = Partial<InsertCostItem>;

export type CreateProjectIntakeRequest = InsertProjectIntake;
export type UpdateProjectIntakeRequest = Partial<InsertProjectIntake>;

export type CreateChangeRequestRequest = InsertChangeRequest;
export type UpdateChangeRequestRequest = Partial<InsertChangeRequest>;

export type CreateProjectDocumentRequest = InsertProjectDocument;
export type UpdateProjectDocumentRequest = Partial<InsertProjectDocument>;

export type CreateTimesheetEntryRequest = InsertTimesheetEntry;
export type UpdateTimesheetEntryRequest = Partial<InsertTimesheetEntry>;

// Organization Integrations
export const insertOrganizationIntegrationSchema = createInsertSchema(organizationIntegrations).omit({
  id: true,
  updatedAt: true,
});
export type InsertOrganizationIntegration = z.infer<typeof insertOrganizationIntegrationSchema>;
export type OrganizationIntegration = typeof organizationIntegrations.$inferSelect;

// System-wide email delivery settings (singleton row managed by super admins).
// SMTP password is encrypted at rest via server/lib/tokenEncryption.ts.
export const systemEmailSettings = pgTable("system_email_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("resend"), // 'resend' | 'smtp' | 'graph'
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpSecure: boolean("smtp_secure").default(false), // true for 465 SSL, false for 587 STARTTLS
  smtpUser: text("smtp_user"),
  smtpPasswordEncrypted: text("smtp_password_encrypted"),
  // Microsoft Graph (Entra ID) credentials for client-credentials flow
  graphTenantId: text("graph_tenant_id"),
  graphClientId: text("graph_client_id"),
  graphClientSecretEncrypted: text("graph_client_secret_encrypted"),
  graphSenderAddress: text("graph_sender_address"), // mailbox to send as (must match app permission scope)
  fromAddress: text("from_address"),
  fromName: text("from_name"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: text("last_test_status"), // 'success' | 'failed' | null
  lastTestError: text("last_test_error"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemEmailSettingsSchema = createInsertSchema(systemEmailSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSystemEmailSettings = z.infer<typeof insertSystemEmailSettingsSchema>;
export type SystemEmailSettings = typeof systemEmailSettings.$inferSelect;

// Per-attempt log of outbound notification deliveries. Records which provider was
// used (graph/smtp/resend), the result, and minimal metadata for diagnosis.
// Does NOT store body, attachments or any other sensitive content.
export const EMAIL_DELIVERY_PROVIDERS = ["graph", "smtp", "resend"] as const;
export const EMAIL_DELIVERY_STATUSES = ["sent", "failed"] as const;
export type EmailDeliveryProvider = (typeof EMAIL_DELIVERY_PROVIDERS)[number];
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

export const emailDeliveryLog = pgTable("email_delivery_log", {
  id: serial("id").primaryKey(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  messageId: text("message_id"),
  ccCount: integer("cc_count").notNull().default(0),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index("email_delivery_log_created_at_idx").on(t.createdAt),
  providerIdx: index("email_delivery_log_provider_idx").on(t.provider),
  statusIdx: index("email_delivery_log_status_idx").on(t.status),
}));

export type EmailDeliveryLogEntry = typeof emailDeliveryLog.$inferSelect;
export type InsertEmailDeliveryLogEntry = typeof emailDeliveryLog.$inferInsert;

// Custom Dashboards - AI-generated dashboards saved by users
export const customDashboards = pgTable("custom_dashboards", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"), // User's original request
  config: jsonb("config").$type<CustomDashboardConfig>().notNull(), // AI-generated configuration
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Custom Dashboard Configuration Types
export interface DashboardWidget {
  id: string;
  type: 'kpi' | 'bar-chart' | 'line-chart' | 'pie-chart' | 'area-chart' | 'table' | 'progress' | 'powerbi-embed' | 'gantt' | 'narrative' | 'recent-tasks' | 'stat-card' | 'heatmap' | 'trend-card' | 'milestone-timeline';
  title: string;
  dataSource: 'projects' | 'portfolios' | 'tasks' | 'risks' | 'issues' | 'milestones' | 'resources' | 'timesheets' | 'external';
  metrics?: string[];
  filters?: Record<string, any>;
  aggregation?: 'count' | 'sum' | 'average' | 'percentage';
  groupBy?: string;
  size: 'small' | 'medium' | 'large' | 'full';
  embedUrl?: string; // For Power BI or other iframe embeds
  limit?: number; // For widgets that show limited items (e.g., recent-tasks)
  narrativeTemplate?: string; // For narrative widgets
  trendField?: string; // For trend cards to show change over time
  colorScheme?: 'green' | 'blue' | 'amber' | 'red' | 'purple'; // Color scheme for stat cards
}

export interface CustomDashboardConfig {
  widgets: DashboardWidget[];
  layout?: 'grid' | 'masonry';
  refreshInterval?: number;
}

export const insertCustomDashboardSchema = createInsertSchema(customDashboards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomDashboard = z.infer<typeof insertCustomDashboardSchema>;
export type CustomDashboard = typeof customDashboards.$inferSelect;

// Recycle Bin Types
export type RecycleBinItemType = 'portfolio' | 'project' | 'task' | 'risk' | 'milestone' | 'issue';

export interface RecycleBinItem {
  id: number;
  type: RecycleBinItemType;
  name: string;
  projectName?: string; // For items belonging to a project
  deletedAt: Date;
  deletedBy: string | null;
  deletedByName?: string;
}

// Project Views - User-specific saved view configurations for Grid and Gantt modes
export const projectViews = pgTable("project_views", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: text("mode").notNull(), // 'grid' or 'gantt'
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false), // User's default view for this mode
  isSystem: boolean("is_system").default(false), // System default view (cannot be deleted)
  portfolioId: integer("portfolio_id").references(() => portfolios.id, { onDelete: 'cascade' }), // null = global; non-null = portfolio-scoped
  visibleColumns: text("visible_columns").array().notNull(),
  columnOrder: text("column_order").array(),
  columnWidths: jsonb("column_widths").$type<Record<string, number>>(),
  frozenColumns: text("frozen_columns").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgPortfolioModeIdx: index("project_views_org_portfolio_mode_idx").on(table.organizationId, table.portfolioId, table.mode),
}));

export const insertProjectViewSchema = createInsertSchema(projectViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectView = z.infer<typeof insertProjectViewSchema>;
export type ProjectView = typeof projectViews.$inferSelect;
export type UpdateProjectViewRequest = Partial<InsertProjectView>;

// System Project Views - Admin-managed org-level views available to all members
export const systemProjectViews = pgTable("system_project_views", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  mode: text("mode").notNull(), // 'grid' or 'gantt'
  name: text("name").notNull(),
  description: text("description"), // Description of what this view shows
  portfolioId: integer("portfolio_id").references(() => portfolios.id, { onDelete: 'cascade' }), // null = global; non-null = portfolio-scoped
  visibleColumns: text("visible_columns").array().notNull(),
  columnOrder: text("column_order").array(),
  columnWidths: jsonb("column_widths").$type<Record<string, number>>(),
  filterCriteria: jsonb("filter_criteria").$type<SystemViewFilterCriteria>(), // Optional filter criteria
  isActive: boolean("is_active").default(true), // Admins can deactivate without deleting
  displayOrder: integer("display_order").default(0), // Order in the dropdown
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgPortfolioModeIdx: index("system_project_views_org_portfolio_mode_idx").on(table.organizationId, table.portfolioId, table.mode),
}));

// Filter criteria for system views
export interface SystemViewFilterCriteria {
  status?: string[];
  priority?: string[];
  health?: string[];
  portfolioIds?: number[];
  dateRange?: { field: string; start?: string; end?: string };
}

export const insertSystemProjectViewSchema = createInsertSchema(systemProjectViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSystemProjectView = z.infer<typeof insertSystemProjectViewSchema>;
export type SystemProjectView = typeof systemProjectViews.$inferSelect;
export type UpdateSystemProjectViewRequest = Partial<InsertSystemProjectView>;

// User Consents - Tracking acceptance of Terms of Service, Privacy Policy, etc.
export const userConsents = pgTable("user_consents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  consentType: text("consent_type").notNull(), // 'terms_of_service', 'privacy_policy', 'marketing', etc.
  version: text("version").notNull(), // Version of the document accepted (e.g., '1.0', '2024-01')
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  ipAddress: text("ip_address"), // IP address at time of consent
  userAgent: text("user_agent"), // Browser/device info
  method: text("method").notNull().default("checkbox"), // 'checkbox', 'modal', 'signup', etc.
  revoked: boolean("revoked").default(false),
  revokedAt: timestamp("revoked_at"),
});

export const insertUserConsentSchema = createInsertSchema(userConsents).omit({
  id: true,
  acceptedAt: true,
  revoked: true,
  revokedAt: true,
});

export type InsertUserConsent = z.infer<typeof insertUserConsentSchema>;
export type UserConsent = typeof userConsents.$inferSelect;

// Current Terms/Privacy versions - used to check if user needs to re-accept
export const CURRENT_TERMS_VERSION = "2026-01";
export const CURRENT_PRIVACY_VERSION = "2026-01";

// Custom Field Definitions - Define custom fields for projects, tasks, or resources per organization
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull(), // 'text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'autonumber'
  entityType: text("entity_type").default("project").notNull(), // 'project', 'task', 'resource', 'intake' (intake-typed fields also appear on the resulting project after conversion)
  description: text("description"),
  isRequired: boolean("is_required").default(false),
  options: text("options").array(), // For select/multiselect types
  defaultValue: text("default_value"),
  // For fieldType='autonumber': the display mask. Use `#` as a digit placeholder
  // for the zero-padded sequence number, e.g. "N###" -> N001, N002, ...
  // "PRJ-####" -> PRJ-0001. If no `#` characters are present, the sequence is
  // appended as a plain integer.
  mask: text("mask"),
  // For fieldType='autonumber': the next sequence number to assign. Incremented
  // atomically when an entity of this entityType is created.
  nextSequence: integer("next_sequence").default(1),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomFieldDefinitionSchema = createInsertSchema(customFieldDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomFieldDefinition = z.infer<typeof insertCustomFieldDefinitionSchema>;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type UpdateCustomFieldDefinitionRequest = Partial<InsertCustomFieldDefinition>;

// Project Custom Field Values - Store values for custom fields per project
export const projectCustomFieldValues = pgTable("project_custom_field_values", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"), // JSON string for complex types (multiselect arrays, etc.)
  textValue: text("text_value"), // Legacy typed storage
  numberValue: numeric("number_value"), // Legacy typed storage
  dateValue: date("date_value"), // Legacy typed storage
  booleanValue: boolean("boolean_value"), // Legacy typed storage
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("pcfv_project_field_idx").on(table.projectId, table.fieldDefinitionId),
]);

export const insertProjectCustomFieldValueSchema = createInsertSchema(projectCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertProjectCustomFieldValue = z.infer<typeof insertProjectCustomFieldValueSchema>;
export type ProjectCustomFieldValue = typeof projectCustomFieldValues.$inferSelect;
export type UpdateProjectCustomFieldValueRequest = Partial<InsertProjectCustomFieldValue>;

// Task Custom Field Values - Store values for custom fields per task
export const taskCustomFieldValues = pgTable("task_custom_field_values", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("tcfv_task_field_idx").on(table.taskId, table.fieldDefinitionId),
]);

export const insertTaskCustomFieldValueSchema = createInsertSchema(taskCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertTaskCustomFieldValue = z.infer<typeof insertTaskCustomFieldValueSchema>;
export type TaskCustomFieldValue = typeof taskCustomFieldValues.$inferSelect;

// Resource Custom Field Values - Store values for custom fields per resource
export const resourceCustomFieldValues = pgTable("resource_custom_field_values", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("rcfv_resource_field_idx").on(table.resourceId, table.fieldDefinitionId),
]);

export const insertResourceCustomFieldValueSchema = createInsertSchema(resourceCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertResourceCustomFieldValue = z.infer<typeof insertResourceCustomFieldValueSchema>;
export type ResourceCustomFieldValue = typeof resourceCustomFieldValues.$inferSelect;

// Intake Custom Field Values - Store values for custom fields per intake.
// Definitions with entityType='intake' show up on the intake form. When the
// intake is approved/converted to a project, these values are copied into
// project_custom_field_values keyed by the same fieldDefinitionId, so the
// resulting project carries the captured intake data forward automatically.
export const intakeCustomFieldValues = pgTable("intake_custom_field_values", {
  id: serial("id").primaryKey(),
  intakeId: integer("intake_id").references(() => projectIntakes.id, { onDelete: "cascade" }).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("icfv_intake_field_idx").on(table.intakeId, table.fieldDefinitionId),
]);

export const insertIntakeCustomFieldValueSchema = createInsertSchema(intakeCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertIntakeCustomFieldValue = z.infer<typeof insertIntakeCustomFieldValueSchema>;
export type IntakeCustomFieldValue = typeof intakeCustomFieldValues.$inferSelect;

// Custom Project Tabs - User-defined tabs for project details
export const customProjectTabs = pgTable("custom_project_tabs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // Lucide icon name
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  sourceTemplateId: integer("source_template_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertCustomProjectTabSchema = createInsertSchema(customProjectTabs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomProjectTab = z.infer<typeof insertCustomProjectTabSchema>;
export type CustomProjectTab = typeof customProjectTabs.$inferSelect;

// Custom Tab Sections - Sections within a custom tab
export const customTabSections = pgTable("custom_tab_sections", {
  id: serial("id").primaryKey(),
  tabId: integer("tab_id").references(() => customProjectTabs.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  columns: integer("columns").default(2), // 1, 2, 3, or 4 column layout
  displayOrder: integer("display_order").default(0),
  isCollapsible: boolean("is_collapsible").default(true),
  isCollapsedByDefault: boolean("is_collapsed_by_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomTabSectionSchema = createInsertSchema(customTabSections).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomTabSection = z.infer<typeof insertCustomTabSectionSchema>;
export type CustomTabSection = typeof customTabSections.$inferSelect;

// Custom Tab Fields - Fields within a section
export const customTabFields = pgTable("custom_tab_fields", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").references(() => customTabSections.id).notNull(),
  fieldKey: text("field_key").notNull(),
  fieldType: text("field_type").notNull(),
  label: text("label"),
  displayOrder: integer("display_order").default(0),
  span: integer("span").default(1),
  isRequired: boolean("is_required").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomTabFieldSchema = createInsertSchema(customTabFields).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomTabField = z.infer<typeof insertCustomTabFieldSchema>;
export type CustomTabField = typeof customTabFields.$inferSelect;

// Project field definitions for the custom tab builder
export const PROJECT_FIELD_DEFINITIONS = [
  { key: 'name', label: 'Project Name', type: 'text' },
  { key: 'projectCode', label: 'Project Code', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'status', label: 'Status', type: 'select' },
  { key: 'priority', label: 'Priority', type: 'select' },
  { key: 'health', label: 'Health', type: 'select' },
  { key: 'healthReason', label: 'Health Reason', type: 'textarea' },
  { key: 'projectType', label: 'Project Type', type: 'text' },
  { key: 'methodology', label: 'Methodology', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'endDate', label: 'End Date', type: 'date' },
  { key: 'baselineStartDate', label: 'Baseline Start Date', type: 'date' },
  { key: 'baselineEndDate', label: 'Baseline End Date', type: 'date' },
  { key: 'actualStartDate', label: 'Actual Start Date', type: 'date' },
  { key: 'actualEndDate', label: 'Actual End Date', type: 'date' },
  { key: 'budget', label: 'Budget', type: 'currency' },
  { key: 'actualCost', label: 'Actual Cost', type: 'currency' },
  { key: 'forecastCost', label: 'Forecast Cost', type: 'currency' },
  { key: 'completionPercentage', label: 'Completion %', type: 'percentage' },
  { key: 'scheduleVariance', label: 'Schedule Variance', type: 'number' },
  { key: 'costVariance', label: 'Cost Variance', type: 'number' },
  { key: 'scope', label: 'Scope', type: 'textarea' },
  { key: 'objectives', label: 'Objectives', type: 'textarea' },
  { key: 'successCriteria', label: 'Success Criteria', type: 'textarea' },
  { key: 'constraints', label: 'Constraints', type: 'textarea' },
  { key: 'assumptions', label: 'Assumptions', type: 'textarea' },
  { key: 'dependencies', label: 'Dependencies', type: 'textarea' },
  { key: 'businessValue', label: 'Business Value', type: 'text' },
  { key: 'riskLevel', label: 'Risk Level', type: 'select' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
  { key: 'billableStatus', label: 'Billable Status', type: 'select' },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'portfolioId', label: 'Portfolio', type: 'reference' },
  { key: 'managerResourceId', label: 'Project Manager', type: 'reference' },
] as const;

export type ProjectFieldKey = typeof PROJECT_FIELD_DEFINITIONS[number]['key'];

// =====================================================================
// Project Tab Templates - Reusable, industry-flavored snapshots of
// custom-tab layouts that admins can apply to organizations.
// `scope` = 'system' (managed by super-admins, available to all orgs)
// or 'org' (private to the organization that owns it).
// =====================================================================
export const projectTabTemplates = pgTable("project_tab_templates", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(), // Stable identifier for system templates ('generic-pmo', etc)
  name: text("name").notNull(),
  description: text("description"),
  industry: text("industry"), // e.g. 'Generic', 'Construction', 'IT/Software'
  icon: text("icon"),
  scope: text("scope").notNull().default("system"), // 'system' | 'org'
  organizationId: integer("organization_id").references(() => organizations.id), // nullable for system
  isPublished: boolean("is_published").default(true),
  version: integer("version").default(1),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectTabTemplateTabs = pgTable("project_tab_template_tabs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => projectTabTemplates.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  displayOrder: integer("display_order").default(0),
});

export const projectTabTemplateSections = pgTable("project_tab_template_sections", {
  id: serial("id").primaryKey(),
  templateTabId: integer("template_tab_id").references(() => projectTabTemplateTabs.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  columns: integer("columns").default(2),
  displayOrder: integer("display_order").default(0),
  isCollapsible: boolean("is_collapsible").default(true),
  isCollapsedByDefault: boolean("is_collapsed_by_default").default(false),
});

export const projectTabTemplateFields = pgTable("project_tab_template_fields", {
  id: serial("id").primaryKey(),
  templateSectionId: integer("template_section_id").references(() => projectTabTemplateSections.id, { onDelete: 'cascade' }).notNull(),
  fieldKey: text("field_key").notNull(),
  fieldType: text("field_type").notNull(),
  label: text("label"),
  displayOrder: integer("display_order").default(0),
  span: integer("span").default(1),
  isRequired: boolean("is_required").default(false),
});

export const insertProjectTabTemplateSchema = createInsertSchema(projectTabTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type ProjectTabTemplate = typeof projectTabTemplates.$inferSelect;
export type InsertProjectTabTemplate = z.infer<typeof insertProjectTabTemplateSchema>;
export type ProjectTabTemplateTab = typeof projectTabTemplateTabs.$inferSelect;
export type ProjectTabTemplateSection = typeof projectTabTemplateSections.$inferSelect;
export type ProjectTabTemplateField = typeof projectTabTemplateFields.$inferSelect;

// Tracks which organizations have applied which templates so structural
// edits to a template can be propagated automatically.
export const organizationAppliedTemplates = pgTable("organization_applied_templates", {
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  templateId: integer("template_id").references(() => projectTabTemplates.id, { onDelete: 'cascade' }).notNull(),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.organizationId, t.templateId] }),
}));
export type OrganizationAppliedTemplate = typeof organizationAppliedTemplates.$inferSelect;

// Portfolio Scoring Criteria - defines scoring dimensions with weights
// Project Scoring Criteria - organization-level criteria for scoring projects
export const projectScoringCriteria = pgTable("project_scoring_criteria", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // Strategic, Financial, Risk, Resource, etc.
  weight: numeric("weight").default(1), // Weight for weighted scoring
  minScore: integer("min_score").default(0),
  maxScore: integer("max_score").default(10),
  scoringGuidelines: text("scoring_guidelines"), // Instructions for scoring
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertProjectScoringCriteriaSchema = createInsertSchema(projectScoringCriteria).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectScoringCriteria = z.infer<typeof insertProjectScoringCriteriaSchema>;
export type ProjectScoringCriteria = typeof projectScoringCriteria.$inferSelect;

// Project Scores - actual scores for projects on each criterion
export const projectScores = pgTable("project_scores", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  criteriaId: integer("criteria_id").references(() => projectScoringCriteria.id).notNull(),
  score: integer("score").notNull(),
  justification: text("justification"),
  scoredAt: timestamp("scored_at").defaultNow(),
  scoredBy: varchar("scored_by").references(() => users.id),
}, (table) => [
  uniqueIndex("project_scores_project_criteria_idx").on(table.projectId, table.criteriaId),
]);

export const insertProjectScoreSchema = createInsertSchema(projectScores).omit({
  id: true,
  scoredAt: true,
});

export type InsertProjectScore = z.infer<typeof insertProjectScoreSchema>;
export type ProjectScore = typeof projectScores.$inferSelect;

// Portfolio Scoring Config - per-portfolio overrides for how project scores are aggregated
export const portfolioScoringConfig = pgTable("portfolio_scoring_config", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  criteriaId: integer("criteria_id").references(() => projectScoringCriteria.id).notNull(),
  aggregationMethod: text("aggregation_method").default("average").notNull(), // average, sum, max, min, weighted-average
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("portfolio_scoring_config_portfolio_criteria_idx").on(table.portfolioId, table.criteriaId),
]);

export type PortfolioScoringConfig = typeof portfolioScoringConfig.$inferSelect;

// Project Benefits - track expected and realized benefits
export const projectBenefits = pgTable("project_benefits", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // Financial, Operational, Strategic, Customer, etc.
  benefitType: text("benefit_type"), // Tangible, Intangible
  measurementMethod: text("measurement_method"), // How the benefit is measured
  unit: text("unit"), // Currency, Percentage, Number, etc.
  targetValue: numeric("target_value"), // Expected/target value
  actualValue: numeric("actual_value"), // Realized/actual value
  baselineValue: numeric("baseline_value"), // Value before project
  targetDate: date("target_date"), // When benefit should be realized
  actualRealizationDate: date("actual_realization_date"), // When benefit was realized
  status: text("status").default("Planned"), // Planned, In Progress, Partially Realized, Fully Realized, Not Achieved
  owner: varchar("owner").references(() => users.id), // Who is responsible
  notes: text("notes"),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectBenefitSchema = createInsertSchema(projectBenefits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectBenefit = z.infer<typeof insertProjectBenefitSchema>;
export type ProjectBenefit = typeof projectBenefits.$inferSelect;

// Project Decisions - log key decisions made for projects
export const projectDecisions = pgTable("project_decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  decisionType: text("decision_type"), // Strategic, Financial, Resource, Risk, Scope, etc.
  status: text("status").default("Pending"), // Pending, Approved, Rejected, Deferred, Implemented
  rationale: text("rationale"), // Why this decision was made
  alternatives: text("alternatives"), // Alternatives considered
  impact: text("impact"), // Expected impact of the decision
  riskAssessment: text("risk_assessment"), // Risks associated with the decision
  stakeholders: text("stakeholders"), // Key stakeholders involved
  decisionDate: date("decision_date"),
  implementationDate: date("implementation_date"),
  reviewDate: date("review_date"), // When to review the decision
  outcome: text("outcome"), // Actual outcome after implementation
  decisionMaker: varchar("decision_maker").references(() => users.id),
  priority: text("priority").default("Medium"),
  notes: text("notes"),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectDecisionSchema = createInsertSchema(projectDecisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectDecision = z.infer<typeof insertProjectDecisionSchema>;
export type ProjectDecision = typeof projectDecisions.$inferSelect;

// Lessons Learned
export const lessonsLearned = pgTable("lessons_learned", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").default("General"),
  type: text("type").default("Improvement"),
  lessonType: text("lesson_type").default("Positive"),
  impact: text("impact"),
  phase: text("phase"),
  rootCause: text("root_cause"),
  recommendation: text("recommendation"),
  outcome: text("outcome"),
  actionsTaken: text("actions_taken"),
  applicability: text("applicability"),
  tags: text("tags"),
  attachments: text("attachments"),
  isShared: boolean("is_shared").default(false),
  status: text("status").default("Draft"),
  dateIdentified: date("date_identified"),
  identifiedBy: varchar("identified_by").references(() => users.id),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
});

export const insertLessonLearnedSchema = createInsertSchema(lessonsLearned).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertLessonLearned = z.infer<typeof insertLessonLearnedSchema>;
export type LessonLearned = typeof lessonsLearned.$inferSelect;

// === APPLICATION MONITORING ===

// API Request Logs - track all API requests for monitoring
export const apiRequestLogs = pgTable("api_request_logs", {
  id: serial("id").primaryKey(),
  method: text("method").notNull(), // GET, POST, PUT, DELETE, etc.
  path: text("path").notNull(), // API endpoint path
  statusCode: integer("status_code"), // HTTP response status
  duration: integer("duration"), // Response time in milliseconds
  userId: varchar("user_id").references(() => users.id), // Who made the request
  organizationId: integer("organization_id").references(() => organizations.id),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  errorMessage: text("error_message"), // Error details if request failed
  requestBody: jsonb("request_body"), // Sanitized request body for debugging
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApiRequestLog = typeof apiRequestLogs.$inferSelect;

// Application Metrics - aggregated metrics for dashboards
export const applicationMetrics = pgTable("application_metrics", {
  id: serial("id").primaryKey(),
  metricName: text("metric_name").notNull(),
  metricValue: numeric("metric_value").notNull(),
  dimensions: jsonb("dimensions"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export type ApplicationMetric = typeof applicationMetrics.$inferSelect;

// User Activity Logs - track important user actions
export const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserActivityLog = typeof userActivityLogs.$inferSelect;

// Feature Usage - track which features are being used
export const featureUsageLogs = pgTable("feature_usage_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  featureCode: text("feature_code").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  usageCount: integer("usage_count").default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type FeatureUsageLog = typeof featureUsageLogs.$inferSelect;

// Error Logs - detailed error tracking
export const errorLogs = pgTable("error_logs", {
  id: serial("id").primaryKey(),
  errorType: text("error_type").notNull(),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  userId: varchar("user_id").references(() => users.id),
  organizationId: integer("organization_id").references(() => organizations.id),
  requestUrl: text("request_url"),
  requestMethod: text("request_method"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ErrorLog = typeof errorLogs.$inferSelect;

// Help Tickets - user feedback and support requests
export const helpTickets = pgTable("help_tickets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name"),
  organizationId: integer("organization_id").references(() => organizations.id),
  organizationName: text("organization_name"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  imageUrls: text("image_urls").array(), // Array of image URLs stored in object storage
  status: text("status").notNull().default("new"), // new, in_progress, resolved, closed
  priority: text("priority").default("normal"), // low, normal, high, urgent
  assignedTo: varchar("assigned_to").references(() => users.id),
  resolution: text("resolution"),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertHelpTicketSchema = createInsertSchema(helpTickets).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  resolvedAt: true,
  emailSent: true,
  emailSentAt: true 
});
export type InsertHelpTicket = z.infer<typeof insertHelpTicketSchema>;
export type HelpTicket = typeof helpTickets.$inferSelect;
// === SIMULATION MODULE ===

// Simulation Runs - Portfolio/project simulation sessions
export const simulationRuns = pgTable("simulation_runs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  name: text("name").notNull(),
  description: text("description"),
  timeHorizon: text("time_horizon").notNull(), // "1month", "3months", "6months", "1year"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  scenario: text("scenario").default("baseline"), // "optimistic", "baseline", "pessimistic"
  status: text("status").default("pending"), // "pending", "running", "completed", "cancelled"
  currentStep: integer("current_step").default(0),
  totalSteps: integer("total_steps").default(0),
  riskTriggerProbabilityMultiplier: numeric("risk_trigger_probability_multiplier").default(1.0),
  budgetVarianceRange: numeric("budget_variance_range").default(0.1),
  scheduleVarianceRange: numeric("schedule_variance_range").default(0.1),
  snapshotData: jsonb("snapshot_data").$type<SimulationSnapshot>(),
  finalResults: jsonb("final_results").$type<SimulationResults>(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Simulation Events - Individual events triggered during simulation
export const simulationEvents = pgTable("simulation_events", {
  id: serial("id").primaryKey(),
  simulationRunId: integer("simulation_run_id").references(() => simulationRuns.id).notNull(),
  stepNumber: integer("step_number").notNull(),
  eventDate: date("event_date").notNull(),
  eventType: text("event_type").notNull(), // "risk_triggered", "deadline_missed", "budget_exceeded", "resource_overload", "milestone_delayed"
  severity: text("severity").default("medium"), // "low", "medium", "high", "critical"
  sourceType: text("source_type"), // "risk", "task", "project", "resource"
  sourceId: integer("source_id"),
  sourceName: text("source_name"),
  projectId: integer("project_id").references(() => projects.id),
  projectName: text("project_name"),
  title: text("title").notNull(),
  description: text("description"),
  impactBudget: numeric("impact_budget"),
  impactScheduleDays: integer("impact_schedule_days"),
  impactHealth: text("impact_health"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Simulation Step Snapshots - State at each time step
export const simulationSnapshots = pgTable("simulation_snapshots", {
  id: serial("id").primaryKey(),
  simulationRunId: integer("simulation_run_id").references(() => simulationRuns.id).notNull(),
  stepNumber: integer("step_number").notNull(),
  stepDate: date("step_date").notNull(),
  portfolioHealth: text("portfolio_health"),
  totalBudget: numeric("total_budget"),
  totalSpent: numeric("total_spent"),
  totalForecast: numeric("total_forecast"),
  projectsOnTrack: integer("projects_on_track"),
  projectsAtRisk: integer("projects_at_risk"),
  projectsOffTrack: integer("projects_off_track"),
  openRisks: integer("open_risks"),
  triggeredRisks: integer("triggered_risks"),
  openIssues: integer("open_issues"),
  completedTasks: integer("completed_tasks"),
  totalTasks: integer("total_tasks"),
  resourceUtilization: numeric("resource_utilization"),
  projectStates: jsonb("project_states").$type<ProjectSimState[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Types for simulation JSON data
export interface ProjectSimState {
  projectId: number;
  projectName: string;
  health: string;
  budget: number;
  spent: number;
  forecast: number;
  completionPercentage: number;
  scheduleVarianceDays: number;
  costVariance: number;
}

export interface SimulationSnapshot {
  portfolioHealth: string;
  totalBudget: number;
  totalSpent: number;
  totalForecast: number;
  projectStates: ProjectSimState[];
}

export interface SimulationResults {
  scenario: string;
  finalHealth: string;
  budgetVariance: number;
  scheduleVarianceDays: number;
  riskTriggeredCount: number;
  issuesCreatedCount: number;
  projectsCompleted: number;
  projectsDelayed: number;
  projectsOverBudget: number;
  recommendations: string[];
}

export const insertSimulationRunSchema = createInsertSchema(simulationRuns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type InsertSimulationRun = z.infer<typeof insertSimulationRunSchema>;
export type SimulationRun = typeof simulationRuns.$inferSelect;

export const insertSimulationEventSchema = createInsertSchema(simulationEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertSimulationEvent = z.infer<typeof insertSimulationEventSchema>;
export type SimulationEvent = typeof simulationEvents.$inferSelect;

export const insertSimulationSnapshotSchema = createInsertSchema(simulationSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertSimulationSnapshot = z.infer<typeof insertSimulationSnapshotSchema>;
export type SimulationSnapshot2 = typeof simulationSnapshots.$inferSelect;

// Report Subscriptions - scheduled email reports for dashboards
export const reportSubscriptions = pgTable("report_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "Weekly Portfolio Summary"
  dashboards: text("dashboards").array().notNull(), // e.g., ["timesheet-overview", "project-hours"]
  frequency: text("frequency").notNull(), // daily, weekly, monthly
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly (0=Sunday)
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  timeOfDay: text("time_of_day").notNull().default("09:00"), // HH:mm format
  timezone: text("timezone").notNull().default("America/New_York"),
  recipients: text("recipients").array(), // Additional email addresses
  isActive: boolean("is_active").notNull().default(true),
  lastSentAt: timestamp("last_sent_at"),
  nextScheduledAt: timestamp("next_scheduled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportSubscriptionSchema = createInsertSchema(reportSubscriptions).omit({
  id: true,
  lastSentAt: true,
  nextScheduledAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReportSubscription = z.infer<typeof insertReportSubscriptionSchema>;
export type ReportSubscription = typeof reportSubscriptions.$inferSelect;

// Resource Availability (planned time-off, leave, holidays, training)
export const resourceAvailability = pgTable("resource_availability", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: text("type").notNull(), // leave, pto, sick, holiday, training, other
  hoursPerDay: numeric("hours_per_day"), // Override hours unavailable per day (null = full day)
  notes: text("notes"),
  status: text("status").default("approved"), // pending, approved, rejected
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
});

export const insertResourceAvailabilitySchema = createInsertSchema(resourceAvailability).omit({
  id: true,
  createdAt: true,
});
export type InsertResourceAvailability = z.infer<typeof insertResourceAvailabilitySchema>;
export type ResourceAvailability = typeof resourceAvailability.$inferSelect;

// Resource Skills (normalized skill tracking)
export const resourceSkills = pgTable("resource_skills", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  skillName: text("skill_name").notNull(),
  proficiencyLevel: text("proficiency_level"), // Beginner, Intermediate, Advanced, Expert
  yearsOfExperience: numeric("years_of_experience"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
});

export const insertResourceSkillSchema = createInsertSchema(resourceSkills).omit({
  id: true,
  createdAt: true,
});
export type InsertResourceSkill = z.infer<typeof insertResourceSkillSchema>;
export type ResourceSkill = typeof resourceSkills.$inferSelect;

export const portfolioRiskAssessments = pgTable("portfolio_risk_assessments", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  riskScore: integer("risk_score").notNull(),
  summary: text("summary").notNull(),
  reportJson: text("report_json").notNull(),
  shareToken: text("share_token").notNull(),
  generatedBy: varchar("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPortfolioRiskAssessmentSchema = createInsertSchema(portfolioRiskAssessments).omit({
  id: true,
  createdAt: true,
});
export type InsertPortfolioRiskAssessment = z.infer<typeof insertPortfolioRiskAssessmentSchema>;
export type PortfolioRiskAssessment = typeof portfolioRiskAssessments.$inferSelect;

export const projectRiskAssessments = pgTable("project_risk_assessments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  riskScore: integer("risk_score").notNull(),
  summary: text("summary").notNull(),
  reportJson: text("report_json").notNull(),
  shareToken: text("share_token").notNull(),
  generatedBy: varchar("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectRiskAssessmentSchema = createInsertSchema(projectRiskAssessments).omit({
  id: true,
  createdAt: true,
});
export type InsertProjectRiskAssessment = z.infer<typeof insertProjectRiskAssessmentSchema>;
export type ProjectRiskAssessment = typeof projectRiskAssessments.$inferSelect;

// === LEGACY RISK TABLES ===
// These tables exist in the database but are no longer actively used.
// Risks are now managed through the "issues" table with itemType="risk".
// These definitions are kept for schema completeness and potential data migration.

export const legacyRisks = pgTable("risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  probability: text("probability"),
  impact: text("impact"),
  status: text("status").default("Open"),
  mitigationPlan: text("mitigation_plan"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
  isDemo: boolean("is_demo").default(false),
  riskNumber: text("risk_number"),
  category: text("category"),
  riskScore: integer("risk_score"),
  responseStrategy: text("response_strategy"),
  contingencyPlan: text("contingency_plan"),
  triggerEvents: text("trigger_events"),
  residualRisk: text("residual_risk"),
  ownerId: varchar("owner_id"),
  reviewerId: varchar("reviewer_id"),
  identifiedDate: date("identified_date"),
  targetResolutionDate: date("target_resolution_date"),
  actualResolutionDate: date("actual_resolution_date"),
  impactCost: numeric("impact_cost"),
  impactSchedule: text("impact_schedule"),
  proximity: text("proximity"),
  notes: text("notes"),
  itemType: text("item_type"),
});

export type LegacyRisk = typeof legacyRisks.$inferSelect;

export const legacyRiskChangeLogs = pgTable("risk_change_logs", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => legacyRisks.id).notNull(),
  changedBy: varchar("changed_by"),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
});

export type LegacyRiskChangeLog = typeof legacyRiskChangeLogs.$inferSelect;

export const legacyRiskResourceAssignments = pgTable("risk_resource_assignments", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => legacyRisks.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type LegacyRiskResourceAssignment = typeof legacyRiskResourceAssignments.$inferSelect;

// API Tokens (Bearer auth for Analytics API, scoped to user + organization)
export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token").unique().notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: varchar("name"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("api_tokens_token_idx").on(table.token),
  index("api_tokens_user_org_idx").on(table.userId, table.organizationId),
]);

export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type ApiToken = typeof apiTokens.$inferSelect;

// === TRAINING CONTENT MANAGEMENT ===

export const trainingModules = pgTable("training_modules", {
  id: serial("id").primaryKey(),
  moduleKey: varchar("module_key").unique().notNull(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull(),
  certPrefix: varchar("cert_prefix", { length: 20 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTrainingModuleSchema = createInsertSchema(trainingModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type TrainingModuleRecord = typeof trainingModules.$inferSelect;

export const trainingLessons = pgTable("training_lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").references(() => trainingModules.id, { onDelete: "cascade" }).notNull(),
  lessonKey: varchar("lesson_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  videoTitle: text("video_title").notNull(),
  videoDescription: text("video_description").notNull(),
  keyConcepts: jsonb("key_concepts").$type<string[]>().notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("training_lessons_module_idx").on(table.moduleId),
  uniqueIndex("training_lessons_module_key_idx").on(table.moduleId, table.lessonKey),
]);

export const insertTrainingLessonSchema = createInsertSchema(trainingLessons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingLesson = z.infer<typeof insertTrainingLessonSchema>;
export type TrainingLessonRecord = typeof trainingLessons.$inferSelect;

export const trainingQuizQuestions = pgTable("training_quiz_questions", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").references(() => trainingLessons.id, { onDelete: "cascade" }).notNull(),
  questionKey: varchar("question_key").notNull(),
  scenario: text("scenario").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("training_questions_lesson_idx").on(table.lessonId),
  uniqueIndex("training_questions_lesson_key_idx").on(table.lessonId, table.questionKey),
]);

export const insertTrainingQuizQuestionSchema = createInsertSchema(trainingQuizQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingQuizQuestion = z.infer<typeof insertTrainingQuizQuestionSchema>;
export type TrainingQuizQuestionRecord = typeof trainingQuizQuestions.$inferSelect;

export const unconSelfieLeads = pgTable("uncon_selfie_leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  interviewer: varchar("interviewer", { length: 255 }),
  photoPath: text("photo_path"),
  shareToken: varchar("share_token", { length: 64 }).notNull(),
  followupSentAt: timestamp("followup_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("uncon_selfie_leads_email_idx").on(table.email),
  uniqueIndex("uncon_selfie_leads_share_token_idx").on(table.shareToken),
]);

export const insertUnconSelfieLeadSchema = createInsertSchema(unconSelfieLeads).omit({
  id: true,
  createdAt: true,
});
export type InsertUnconSelfieLead = z.infer<typeof insertUnconSelfieLeadSchema>;
export type UnconSelfieLeadRecord = typeof unconSelfieLeads.$inferSelect;

// === PROJECT TEMPLATES ===

export const projectTemplates = pgTable("project_templates", {
  id: serial("id").primaryKey(),
  // Nullable to allow truly org-less system templates seeded by the platform.
  organizationId: integer("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull().default("project"),
  originalFileName: text("original_file_name"),
  storedFileUrl: text("stored_file_url"),
  itemCount: integer("item_count").default(0),
  milestoneCount: integer("milestone_count").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  sourceProjectId: integer("source_project_id").references(() => projects.id),
  // System library catalogue fields. For org templates these stay null/false.
  isSystem: boolean("is_system").default(false).notNull(),
  industry: text("industry"),
  category: text("category"),
  slug: text("slug"),
  icon: text("icon"),
  estimatedDurationDays: integer("estimated_duration_days"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("project_templates_org_idx").on(table.organizationId),
  uniqueIndex("project_templates_slug_unique").on(table.slug),
  index("project_templates_industry_idx").on(table.industry),
]);

export const projectTemplateItems = pgTable("project_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => projectTemplates.id, { onDelete: "cascade" }).notNull(),
  taskId: integer("task_id"),
  wbs: text("wbs"),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  duration: text("duration"),
  durationDays: numeric("duration_days"),
  outlineLevel: integer("outline_level").default(1),
  parentTaskId: integer("parent_task_id"),
  isSummary: boolean("is_summary").default(false),
  isMilestone: boolean("is_milestone").default(false),
  predecessors: text("predecessors"),
  notes: text("notes"),
  workHours: numeric("work_hours"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("project_template_items_template_idx").on(table.templateId),
]);

export const insertProjectTemplateSchema = createInsertSchema(projectTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectTemplateItemSchema = createInsertSchema(projectTemplateItems).omit({
  id: true,
  createdAt: true,
});
export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type InsertProjectTemplate = z.infer<typeof insertProjectTemplateSchema>;
export type ProjectTemplateItem = typeof projectTemplateItems.$inferSelect;
export type InsertProjectTemplateItem = z.infer<typeof insertProjectTemplateItemSchema>;

export const partnerApplications = pgTable("partner_applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  partnerType: text("partner_type").notNull(),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("partner_apps_email_idx").on(table.email),
  index("partner_apps_status_idx").on(table.status),
]);

export const insertPartnerApplicationSchema = createInsertSchema(partnerApplications).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type PartnerApplication = typeof partnerApplications.$inferSelect;
export type InsertPartnerApplication = z.infer<typeof insertPartnerApplicationSchema>;

export const projectAgents = pgTable("project_agents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  enabled: boolean("enabled").notNull().default(false),
  agendaEnabled: boolean("agenda_enabled").notNull().default(true),
  agendaDay: integer("agenda_day").notNull().default(1),
  agendaTime: text("agenda_time").notNull().default("09:00"),
  taskFollowUpEnabled: boolean("task_follow_up_enabled").notNull().default(true),
  taskFollowUpDay: integer("task_follow_up_day").notNull().default(3),
  taskFollowUpTime: text("task_follow_up_time").notNull().default("09:00"),
  statusReportEnabled: boolean("status_report_enabled").notNull().default(true),
  statusReportDay: integer("status_report_day").notNull().default(5),
  statusReportTime: text("status_report_time").notNull().default("09:00"),
  timezone: text("timezone").notNull().default("America/New_York"),
  lastAgendaRun: timestamp("last_agenda_run"),
  nextAgendaRun: timestamp("next_agenda_run"),
  lastTaskFollowUpRun: timestamp("last_task_follow_up_run"),
  nextTaskFollowUpRun: timestamp("next_task_follow_up_run"),
  lastStatusReportRun: timestamp("last_status_report_run"),
  nextStatusReportRun: timestamp("next_status_report_run"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("project_agents_project_id_unique").on(table.projectId),
  index("project_agents_org_idx").on(table.organizationId),
  index("project_agents_next_agenda_idx").on(table.nextAgendaRun),
  index("project_agents_next_follow_up_idx").on(table.nextTaskFollowUpRun),
  index("project_agents_next_status_idx").on(table.nextStatusReportRun),
]);

export type ProjectAgent = typeof projectAgents.$inferSelect;
export type InsertProjectAgent = typeof projectAgents.$inferInsert;

export const projectAgentLogs = pgTable("project_agent_logs", {
  id: serial("id").primaryKey(),
  projectAgentId: integer("project_agent_id").notNull().references(() => projectAgents.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  actionType: text("action_type").notNull(),
  subject: text("subject"),
  recipientEmails: text("recipient_emails").array(),
  emailPreview: text("email_preview"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProjectAgentLog = typeof projectAgentLogs.$inferSelect;
export type InsertProjectAgentLog = typeof projectAgentLogs.$inferInsert;

// === DAILY LOGS (Field Management) ===

export const dailyLogs = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  logDate: date("log_date").notNull(),
  weatherCondition: text("weather_condition"),
  temperature: text("temperature"),
  windSpeed: text("wind_speed"),
  precipitation: text("precipitation"),
  visitors: text("visitors"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("daily_logs_project_id_idx").on(table.projectId),
  index("daily_logs_org_id_idx").on(table.organizationId),
  index("daily_logs_log_date_idx").on(table.logDate),
  uniqueIndex("daily_logs_project_date_unique").on(table.projectId, table.logDate).where(sql`deleted_at IS NULL`),
]);

export const insertDailyLogSchema = createInsertSchema(dailyLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
});
export type DailyLog = typeof dailyLogs.$inferSelect;
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;

export const dailyLogLabor = pgTable("daily_log_labor", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id").references(() => dailyLogs.id).notNull(),
  company: text("company"),
  trade: text("trade"),
  headcount: integer("headcount").default(0),
  hoursWorked: numeric("hours_worked"),
  notes: text("notes"),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("daily_log_labor_log_id_idx").on(table.dailyLogId),
]);

export const insertDailyLogLaborSchema = createInsertSchema(dailyLogLabor).omit({
  id: true,
});
export type DailyLogLabor = typeof dailyLogLabor.$inferSelect;
export type InsertDailyLogLabor = z.infer<typeof insertDailyLogLaborSchema>;

export const dailyLogEquipment = pgTable("daily_log_equipment", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id").references(() => dailyLogs.id).notNull(),
  equipmentName: text("equipment_name").notNull(),
  quantity: integer("quantity").default(1),
  hoursUsed: numeric("hours_used"),
  status: text("status").default("Active"),
  notes: text("notes"),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("daily_log_equipment_log_id_idx").on(table.dailyLogId),
]);

export const insertDailyLogEquipmentSchema = createInsertSchema(dailyLogEquipment).omit({
  id: true,
});
export type DailyLogEquipment = typeof dailyLogEquipment.$inferSelect;
export type InsertDailyLogEquipment = z.infer<typeof insertDailyLogEquipmentSchema>;

// === RFIs (Requests for Information) ===
export const rfis = pgTable("rfis", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  rfiNumber: text("rfi_number").notNull(),
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  status: text("status").notNull().default("Open"),
  priority: text("priority").default("Medium"),
  category: text("category"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  distributionList: text("distribution_list"),
  costImpact: text("cost_impact"),
  scheduleImpact: text("schedule_impact"),
  references: text("references"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("rfis_project_id_idx").on(table.projectId),
  index("rfis_org_id_idx").on(table.organizationId),
  index("rfis_assigned_to_idx").on(table.assignedTo),
  index("rfis_status_idx").on(table.status),
  uniqueIndex("rfis_project_number_unique").on(table.projectId, table.rfiNumber).where(sql`deleted_at IS NULL`),
]);

export const insertRfiSchema = createInsertSchema(rfis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  closedAt: true,
  closedBy: true,
});
export type Rfi = typeof rfis.$inferSelect;
export type InsertRfi = z.infer<typeof insertRfiSchema>;

// === RFI Responses ===
export const rfiResponses = pgTable("rfi_responses", {
  id: serial("id").primaryKey(),
  rfiId: integer("rfi_id").references(() => rfis.id).notNull(),
  responseText: text("response_text").notNull(),
  isOfficial: boolean("is_official").default(false),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("rfi_responses_rfi_id_idx").on(table.rfiId),
]);

export const insertRfiResponseSchema = createInsertSchema(rfiResponses).omit({
  id: true,
  createdAt: true,
});
export type RfiResponse = typeof rfiResponses.$inferSelect;
export type InsertRfiResponse = z.infer<typeof insertRfiResponseSchema>;

// === Submittals ===
export const submittals = pgTable("submittals", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  submittalNumber: text("submittal_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  specSection: text("spec_section"),
  type: text("type").default("Product Data"),
  status: text("status").notNull().default("Pending"),
  priority: text("priority").default("Medium"),
  submittedBy: varchar("submitted_by").references(() => users.id),
  submittedByName: text("submitted_by_name"),
  reviewerId: varchar("reviewer_id").references(() => users.id),
  reviewerName: text("reviewer_name"),
  submitDate: date("submit_date"),
  requiredDate: date("required_date"),
  receivedDate: date("received_date"),
  reviewedDate: date("reviewed_date"),
  leadTime: integer("lead_time"),
  costImpact: text("cost_impact"),
  scheduleImpact: text("schedule_impact"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  currentRevision: integer("current_revision").default(1),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("submittals_project_id_idx").on(table.projectId),
  index("submittals_org_id_idx").on(table.organizationId),
  index("submittals_reviewer_id_idx").on(table.reviewerId),
  index("submittals_status_idx").on(table.status),
  uniqueIndex("submittals_project_number_unique").on(table.projectId, table.submittalNumber).where(sql`deleted_at IS NULL`),
]);

export const insertSubmittalSchema = createInsertSchema(submittals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  closedAt: true,
  closedBy: true,
});
export type Submittal = typeof submittals.$inferSelect;
export type InsertSubmittal = z.infer<typeof insertSubmittalSchema>;

// === Submittal Revisions ===
export const submittalRevisions = pgTable("submittal_revisions", {
  id: serial("id").primaryKey(),
  submittalId: integer("submittal_id").references(() => submittals.id).notNull(),
  revisionNumber: integer("revision_number").notNull(),
  status: text("status").notNull().default("Pending"),
  notes: text("notes"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  reviewNotes: text("review_notes"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("submittal_revisions_submittal_id_idx").on(table.submittalId),
]);

export const insertSubmittalRevisionSchema = createInsertSchema(submittalRevisions).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});
export type SubmittalRevision = typeof submittalRevisions.$inferSelect;
export type InsertSubmittalRevision = z.infer<typeof insertSubmittalRevisionSchema>;

// === Drawing Sets ===
export const drawingSets = pgTable("drawing_sets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  discipline: text("discipline").default("General"),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("drawing_sets_project_id_idx").on(table.projectId),
  index("drawing_sets_org_id_idx").on(table.organizationId),
  uniqueIndex("drawing_sets_project_name_unique").on(table.projectId, table.name).where(sql`deleted_at IS NULL`),
]);

export const insertDrawingSetSchema = createInsertSchema(drawingSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
});
export type DrawingSet = typeof drawingSets.$inferSelect;
export type InsertDrawingSet = z.infer<typeof insertDrawingSetSchema>;

// === Drawings ===
export const drawings = pgTable("drawings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  drawingSetId: integer("drawing_set_id").references(() => drawingSets.id),
  drawingNumber: text("drawing_number").notNull(),
  title: text("title").notNull(),
  discipline: text("discipline").default("General"),
  status: text("status").notNull().default("Current"),
  description: text("description"),
  currentRevisionNumber: integer("current_revision_number").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("drawings_project_id_idx").on(table.projectId),
  index("drawings_org_id_idx").on(table.organizationId),
  index("drawings_discipline_idx").on(table.discipline),
  index("drawings_status_idx").on(table.status),
  uniqueIndex("drawings_project_number_unique").on(table.projectId, table.drawingNumber).where(sql`deleted_at IS NULL`),
]);

export const insertDrawingSchema = createInsertSchema(drawings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
});
export type Drawing = typeof drawings.$inferSelect;
export type InsertDrawing = z.infer<typeof insertDrawingSchema>;

// === Drawing Revisions ===
export const drawingRevisions = pgTable("drawing_revisions", {
  id: serial("id").primaryKey(),
  drawingId: integer("drawing_id").references(() => drawings.id).notNull(),
  revisionNumber: integer("revision_number").notNull(),
  version: text("version"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  fileType: text("file_type"),
  thumbnailUrl: text("thumbnail_url"),
  notes: text("notes"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedByName: text("uploaded_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("drawing_revisions_drawing_id_idx").on(table.drawingId),
  uniqueIndex("drawing_revisions_drawing_rev_unique").on(table.drawingId, table.revisionNumber),
]);

export const insertDrawingRevisionSchema = createInsertSchema(drawingRevisions).omit({
  id: true,
  createdAt: true,
});
export type DrawingRevision = typeof drawingRevisions.$inferSelect;
export type InsertDrawingRevision = z.infer<typeof insertDrawingRevisionSchema>;

// === Drawing Markups ===
export const drawingMarkups = pgTable("drawing_markups", {
  id: serial("id").primaryKey(),
  revisionId: integer("revision_id").references(() => drawingRevisions.id).notNull(),
  drawingId: integer("drawing_id").references(() => drawings.id).notNull(),
  label: text("label"),
  markupData: jsonb("markup_data").$type<Array<{
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    points?: Array<{ x: number; y: number }>;
    text?: string;
    color?: string;
    strokeWidth?: number;
  }>>().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("drawing_markups_revision_id_idx").on(table.revisionId),
  index("drawing_markups_drawing_id_idx").on(table.drawingId),
]);

export const insertDrawingMarkupSchema = createInsertSchema(drawingMarkups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DrawingMarkup = typeof drawingMarkups.$inferSelect;
export type InsertDrawingMarkup = z.infer<typeof insertDrawingMarkupSchema>;

// === Punch List Items ===
export const punchItems = pgTable("punch_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  category: text("category"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Open"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("punch_items_project_id_idx").on(table.projectId),
  index("punch_items_org_id_idx").on(table.organizationId),
  index("punch_items_status_idx").on(table.status),
  index("punch_items_assigned_to_idx").on(table.assignedTo),
  index("punch_items_category_idx").on(table.category),
  index("punch_items_priority_idx").on(table.priority),
  uniqueIndex("punch_items_project_number_uniq").on(table.projectId, table.number),
]);

export const insertPunchItemSchema = createInsertSchema(punchItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  closedAt: true,
  closedBy: true,
});
export type PunchItem = typeof punchItems.$inferSelect;
export type InsertPunchItem = z.infer<typeof insertPunchItemSchema>;

// === Punch Item Status History ===
export const punchItemStatusHistory = pgTable("punch_item_status_history", {
  id: serial("id").primaryKey(),
  punchItemId: integer("punch_item_id").references(() => punchItems.id).notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("punch_item_status_history_item_id_idx").on(table.punchItemId),
]);

export type PunchItemStatusHistory = typeof punchItemStatusHistory.$inferSelect;

// === Punch Item Photos ===
export const punchItemPhotos = pgTable("punch_item_photos", {
  id: serial("id").primaryKey(),
  punchItemId: integer("punch_item_id").references(() => punchItems.id).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  photoType: text("photo_type").default("general"),
  caption: text("caption"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("punch_item_photos_item_id_idx").on(table.punchItemId),
]);

export const insertPunchItemPhotoSchema = createInsertSchema(punchItemPhotos).omit({
  id: true,
  createdAt: true,
});
export type PunchItemPhoto = typeof punchItemPhotos.$inferSelect;
export type InsertPunchItemPhoto = z.infer<typeof insertPunchItemPhotoSchema>;

// === Quality & Safety Module ===

export const inspectionTemplates = pgTable("inspection_templates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("inspection_templates_project_id_idx").on(table.projectId),
  index("inspection_templates_org_id_idx").on(table.organizationId),
]);

export const insertInspectionTemplateSchema = createInsertSchema(inspectionTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InspectionTemplate = typeof inspectionTemplates.$inferSelect;
export type InsertInspectionTemplate = z.infer<typeof insertInspectionTemplateSchema>;

export const inspectionTemplateItems = pgTable("inspection_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => inspectionTemplates.id).notNull(),
  section: text("section"),
  itemText: text("item_text").notNull(),
  itemType: text("item_type").default("pass_fail"),
  sortOrder: integer("sort_order").default(0),
  isRequired: boolean("is_required").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("inspection_template_items_template_id_idx").on(table.templateId),
]);

export const insertInspectionTemplateItemSchema = createInsertSchema(inspectionTemplateItems).omit({
  id: true,
  createdAt: true,
});
export type InspectionTemplateItem = typeof inspectionTemplateItems.$inferSelect;
export type InsertInspectionTemplateItem = z.infer<typeof insertInspectionTemplateItemSchema>;

export const inspections = pgTable("inspections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  templateId: integer("template_id").references(() => inspectionTemplates.id),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  inspectionType: text("inspection_type"),
  location: text("location"),
  status: text("status").notNull().default("Scheduled"),
  scheduledDate: date("scheduled_date"),
  completedDate: date("completed_date"),
  inspectorId: varchar("inspector_id").references(() => users.id),
  inspectorName: text("inspector_name"),
  overallResult: text("overall_result"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("inspections_project_id_idx").on(table.projectId),
  index("inspections_org_id_idx").on(table.organizationId),
  index("inspections_template_id_idx").on(table.templateId),
  index("inspections_status_idx").on(table.status),
  uniqueIndex("inspections_project_number_uniq").on(table.projectId, table.number),
]);

export const insertInspectionSchema = createInsertSchema(inspections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = z.infer<typeof insertInspectionSchema>;

export const inspectionResults = pgTable("inspection_results", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").references(() => inspections.id).notNull(),
  templateItemId: integer("template_item_id").references(() => inspectionTemplateItems.id),
  itemText: text("item_text").notNull(),
  section: text("section"),
  result: text("result"),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  deficiencyDescription: text("deficiency_description"),
  correctiveAction: text("corrective_action"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("inspection_results_inspection_id_idx").on(table.inspectionId),
]);

export const insertInspectionResultSchema = createInsertSchema(inspectionResults).omit({
  id: true,
  createdAt: true,
});
export type InspectionResult = typeof inspectionResults.$inferSelect;
export type InsertInspectionResult = z.infer<typeof insertInspectionResultSchema>;

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  incidentDate: timestamp("incident_date"),
  incidentTime: text("incident_time"),
  location: text("location"),
  category: text("category"),
  severity: text("severity").notNull().default("Minor"),
  status: text("status").notNull().default("Reported"),
  injuredParties: text("injured_parties"),
  witnesses: text("witnesses"),
  rootCause: text("root_cause"),
  immediateActions: text("immediate_actions"),
  investigationNotes: text("investigation_notes"),
  investigationStatus: text("investigation_status").default("Pending"),
  reportedBy: varchar("reported_by").references(() => users.id),
  reportedByName: text("reported_by_name"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("incidents_project_id_idx").on(table.projectId),
  index("incidents_org_id_idx").on(table.organizationId),
  index("incidents_status_idx").on(table.status),
  index("incidents_severity_idx").on(table.severity),
  uniqueIndex("incidents_project_number_uniq").on(table.projectId, table.number),
]);

export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;

export const incidentActions = pgTable("incident_actions", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => incidents.id).notNull(),
  actionType: text("action_type").notNull().default("Corrective"),
  description: text("description").notNull(),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("Open"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("incident_actions_incident_id_idx").on(table.incidentId),
  index("incident_actions_status_idx").on(table.status),
]);

export const insertIncidentActionSchema = createInsertSchema(incidentActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type IncidentAction = typeof incidentActions.$inferSelect;
export type InsertIncidentAction = z.infer<typeof insertIncidentActionSchema>;

export const observations = pgTable("observations", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("Safety"),
  observationType: text("observation_type").notNull().default("Negative"),
  location: text("location"),
  severity: text("severity").default("Low"),
  status: text("status").notNull().default("Open"),
  photoUrl: text("photo_url"),
  correctiveAction: text("corrective_action"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  observedBy: varchar("observed_by").references(() => users.id),
  observedByName: text("observed_by_name"),
  observedDate: date("observed_date"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("observations_project_id_idx").on(table.projectId),
  index("observations_org_id_idx").on(table.organizationId),
  index("observations_category_idx").on(table.category),
  index("observations_status_idx").on(table.status),
  uniqueIndex("observations_project_number_uniq").on(table.projectId, table.number),
]);

export const insertObservationSchema = createInsertSchema(observations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Observation = typeof observations.$inferSelect;
export type InsertObservation = z.infer<typeof insertObservationSchema>;

export const observationActions = pgTable("observation_actions", {
  id: serial("id").primaryKey(),
  observationId: integer("observation_id").references(() => observations.id).notNull(),
  actionType: text("action_type").notNull().default("Corrective"),
  description: text("description").notNull(),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("Open"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("observation_actions_observation_id_idx").on(table.observationId),
  index("observation_actions_status_idx").on(table.status),
]);

export const insertObservationActionSchema = createInsertSchema(observationActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ObservationAction = typeof observationActions.$inferSelect;
export type InsertObservationAction = z.infer<typeof insertObservationActionSchema>;

// ===================== BIDDING & PRECONSTRUCTION =====================

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  website: text("website"),
  tradeSpecialty: text("trade_specialty"),
  licenseNumber: text("license_number"),
  insuranceExpiry: date("insurance_expiry"),
  bondingCapacity: text("bonding_capacity"),
  status: text("status").notNull().default("Active"),
  rating: integer("rating"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("vendors_organization_id_idx").on(table.organizationId),
  index("vendors_status_idx").on(table.status),
  index("vendors_trade_specialty_idx").on(table.tradeSpecialty),
]);

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

export const vendorPrequalifications = pgTable("vendor_prequalifications", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  safetyRating: integer("safety_rating"),
  financialRating: integer("financial_rating"),
  qualityRating: integer("quality_rating"),
  experienceYears: integer("experience_years"),
  emrRate: text("emr_rate"),
  osha300Log: boolean("osha_300_log").default(false),
  insuranceCertificate: boolean("insurance_certificate").default(false),
  bondingLetter: boolean("bonding_letter").default(false),
  references: jsonb("references"),
  overallScore: integer("overall_score"),
  qualificationStatus: text("qualification_status").notNull().default("Pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("vendor_prequalifications_vendor_id_idx").on(table.vendorId),
  index("vendor_prequalifications_org_id_idx").on(table.organizationId),
  index("vendor_prequalifications_status_idx").on(table.qualificationStatus),
]);

export const insertVendorPrequalificationSchema = createInsertSchema(vendorPrequalifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type VendorPrequalification = typeof vendorPrequalifications.$inferSelect;
export type InsertVendorPrequalification = z.infer<typeof insertVendorPrequalificationSchema>;
export type VendorWithPrequalification = Vendor & { latestPrequalification: VendorPrequalification | null };

export const bidPackages = pgTable("bid_packages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  tradeCategory: text("trade_category"),
  scope: text("scope"),
  estimatedBudget: text("estimated_budget"),
  dueDate: date("due_date"),
  prebidDate: date("prebid_date"),
  status: text("status").notNull().default("Draft"),
  awardedVendorId: integer("awarded_vendor_id").references(() => vendors.id),
  awardedAmount: text("awarded_amount"),
  awardedDate: date("awarded_date"),
  documents: text("documents"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("bid_packages_project_id_idx").on(table.projectId),
  index("bid_packages_org_id_idx").on(table.organizationId),
  index("bid_packages_status_idx").on(table.status),
  uniqueIndex("bid_packages_project_number_uniq").on(table.projectId, table.number),
]);

export const insertBidPackageSchema = createInsertSchema(bidPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BidPackage = typeof bidPackages.$inferSelect;
export type InsertBidPackage = z.infer<typeof insertBidPackageSchema>;

export const bidInvitations = pgTable("bid_invitations", {
  id: serial("id").primaryKey(),
  bidPackageId: integer("bid_package_id").references(() => bidPackages.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  status: text("status").notNull().default("Invited"),
  invitedAt: timestamp("invited_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  declineReason: text("decline_reason"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("bid_invitations_bid_package_id_idx").on(table.bidPackageId),
  index("bid_invitations_vendor_id_idx").on(table.vendorId),
  uniqueIndex("bid_invitations_package_vendor_uniq").on(table.bidPackageId, table.vendorId),
]);

export const insertBidInvitationSchema = createInsertSchema(bidInvitations).omit({
  id: true,
  createdAt: true,
  invitedAt: true,
});
export type BidInvitation = typeof bidInvitations.$inferSelect;
export type InsertBidInvitation = z.infer<typeof insertBidInvitationSchema>;

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  bidPackageId: integer("bid_package_id").references(() => bidPackages.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  totalAmount: text("total_amount").notNull(),
  alternateAmount: text("alternate_amount"),
  bondIncluded: boolean("bond_included").default(false),
  submittedAt: timestamp("submitted_at").defaultNow(),
  notes: text("notes"),
  exclusions: text("exclusions"),
  clarifications: text("clarifications"),
  validUntil: date("valid_until"),
  status: text("status").notNull().default("Submitted"),
  evaluationScore: integer("evaluation_score"),
  evaluationNotes: text("evaluation_notes"),
  isRecommended: boolean("is_recommended").default(false),
  attachments: text("attachments"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("bids_bid_package_id_idx").on(table.bidPackageId),
  index("bids_vendor_id_idx").on(table.vendorId),
  index("bids_status_idx").on(table.status),
  uniqueIndex("bids_package_vendor_uniq").on(table.bidPackageId, table.vendorId),
]);

export const insertBidSchema = createInsertSchema(bids).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
});
export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;

export const bidLineItems = pgTable("bid_line_items", {
  id: serial("id").primaryKey(),
  bidId: integer("bid_id").references(() => bids.id).notNull(),
  bidPackageId: integer("bid_package_id").references(() => bidPackages.id).notNull(),
  description: text("description").notNull(),
  quantity: text("quantity"),
  unit: text("unit"),
  unitPrice: text("unit_price"),
  totalPrice: text("total_price"),
  category: text("category"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("bid_line_items_bid_id_idx").on(table.bidId),
  index("bid_line_items_bid_package_id_idx").on(table.bidPackageId),
]);

export const insertBidLineItemSchema = createInsertSchema(bidLineItems).omit({
  id: true,
  createdAt: true,
});
export type BidLineItem = typeof bidLineItems.$inferSelect;
export type InsertBidLineItem = z.infer<typeof insertBidLineItemSchema>;

// ============ CHANGE ORDERS (Construction Financial Management) ============

export const changeOrders = pgTable("change_orders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  changeOrderNumber: text("change_order_number"),
  title: text("title").notNull(),
  description: text("description"),
  tier: text("tier").default("PCO").notNull(),
  status: text("status").default("Draft").notNull(),
  reasonCode: text("reason_code"),
  costImpact: numeric("cost_impact").default(0),
  scheduleImpactDays: integer("schedule_impact_days").default(0),
  originalContractAmount: numeric("original_contract_amount").default(0),
  revisedContractAmount: numeric("revised_contract_amount").default(0),
  requestedBy: text("requested_by"),
  requestedDate: date("requested_date"),
  reviewedBy: text("reviewed_by"),
  reviewedDate: date("reviewed_date"),
  approvedBy: text("approved_by"),
  approvedDate: date("approved_date"),
  promotedFrom: integer("promoted_from"),
  notes: text("notes"),
  documents: text("documents"),
  attachments: text("attachments"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("change_orders_project_id_idx").on(table.projectId),
  index("change_orders_tier_idx").on(table.tier),
  index("change_orders_status_idx").on(table.status),
]);

export const changeOrderLineItems = pgTable("change_order_line_items", {
  id: serial("id").primaryKey(),
  changeOrderId: integer("change_order_id").references(() => changeOrders.id).notNull(),
  costCode: text("cost_code"),
  description: text("description").notNull(),
  quantity: numeric("quantity").default(1),
  unitPrice: numeric("unit_price").default(0),
  totalPrice: numeric("total_price").default(0),
  category: text("category"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("change_order_line_items_co_id_idx").on(table.changeOrderId),
]);

export const insertChangeOrderSchema = createInsertSchema(changeOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = z.infer<typeof insertChangeOrderSchema>;

export const insertChangeOrderLineItemSchema = createInsertSchema(changeOrderLineItems).omit({
  id: true,
  createdAt: true,
});
export type ChangeOrderLineItem = typeof changeOrderLineItems.$inferSelect;
export type InsertChangeOrderLineItem = z.infer<typeof insertChangeOrderLineItemSchema>;

// ============ CONSTRUCTION INVOICES (Payment Applications) ============

export const constructionInvoices = pgTable("construction_invoices", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  invoiceNumber: text("invoice_number"),
  title: text("title").notNull(),
  description: text("description"),
  contractAmount: numeric("contract_amount").default(0),
  totalAmount: numeric("total_amount").default(0),
  previousBilled: numeric("previous_billed").default(0),
  currentBilled: numeric("current_billed").default(0),
  balanceToFinish: numeric("balance_to_finish").default(0),
  retainage: numeric("retainage").default(0),
  status: text("status").default("Draft").notNull(),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  submittedDate: date("submitted_date"),
  approvedDate: date("approved_date"),
  paidDate: date("paid_date"),
  paidAmount: numeric("paid_amount"),
  vendorName: text("vendor_name"),
  vendorEmail: text("vendor_email"),
  notes: text("notes"),
  documents: text("documents"),
  attachments: text("attachments"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("construction_invoices_project_id_idx").on(table.projectId),
  index("construction_invoices_status_idx").on(table.status),
]);

export const constructionInvoiceLineItems = pgTable("construction_invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => constructionInvoices.id).notNull(),
  costCode: text("cost_code"),
  description: text("description").notNull(),
  scheduledValue: numeric("scheduled_value").default(0),
  previousBilled: numeric("previous_billed").default(0),
  currentBilled: numeric("current_billed").default(0),
  balanceToFinish: numeric("balance_to_finish").default(0),
  percentComplete: numeric("percent_complete").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("construction_invoice_line_items_inv_id_idx").on(table.invoiceId),
]);

export const insertConstructionInvoiceSchema = createInsertSchema(constructionInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ConstructionInvoice = typeof constructionInvoices.$inferSelect;
export type InsertConstructionInvoice = z.infer<typeof insertConstructionInvoiceSchema>;

export const insertConstructionInvoiceLineItemSchema = createInsertSchema(constructionInvoiceLineItems).omit({
  id: true,
  createdAt: true,
});
export type ConstructionInvoiceLineItem = typeof constructionInvoiceLineItems.$inferSelect;
export type InsertConstructionInvoiceLineItem = z.infer<typeof insertConstructionInvoiceLineItemSchema>;

// === MEETINGS MODULE ===

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  meetingNumber: text("meeting_number"),
  title: text("title").notNull(),
  description: text("description"),
  meetingType: text("meeting_type").default("General"),
  status: text("status").default("Scheduled").notNull(),
  date: date("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  location: text("location"),
  attendees: text("attendees"),
  minutesNotes: text("minutes_notes"),
  minutesRecordedAt: timestamp("minutes_recorded_at"),
  minutesRecordedBy: varchar("minutes_recorded_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("meetings_project_id_idx").on(table.projectId),
  index("meetings_date_idx").on(table.date),
  uniqueIndex("meetings_project_number_unique").on(table.projectId, table.meetingNumber),
]);

export const meetingAgendaItems = pgTable("meeting_agenda_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => meetings.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  presenter: text("presenter"),
  duration: integer("duration"),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("meeting_agenda_items_meeting_id_idx").on(table.meetingId),
]);

export const meetingActionItems = pgTable("meeting_action_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => meetings.id).notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  assignee: text("assignee"),
  assigneeId: varchar("assignee_id").references(() => users.id),
  dueDate: date("due_date"),
  status: text("status").default("Open").notNull(),
  priority: text("priority").default("Medium"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("meeting_action_items_meeting_id_idx").on(table.meetingId),
  index("meeting_action_items_project_id_idx").on(table.projectId),
  index("meeting_action_items_status_idx").on(table.status),
]);

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;

export const insertMeetingAgendaItemSchema = createInsertSchema(meetingAgendaItems).omit({
  id: true,
  createdAt: true,
});
export type MeetingAgendaItem = typeof meetingAgendaItems.$inferSelect;
export type InsertMeetingAgendaItem = z.infer<typeof insertMeetingAgendaItemSchema>;

export const insertMeetingActionItemSchema = createInsertSchema(meetingActionItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type MeetingActionItem = typeof meetingActionItems.$inferSelect;
export type InsertMeetingActionItem = z.infer<typeof insertMeetingActionItemSchema>;

export const meetingMinutes = pgTable("meeting_minutes", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => meetings.id).notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  content: text("content"),
  recordedBy: varchar("recorded_by").references(() => users.id),
  recordedByName: text("recorded_by_name"),
  distributedAt: timestamp("distributed_at"),
  distributedTo: text("distributed_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("meeting_minutes_meeting_id_idx").on(table.meetingId),
  uniqueIndex("meeting_minutes_meeting_unique").on(table.meetingId),
]);

export const insertMeetingMinutesSchema = createInsertSchema(meetingMinutes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type MeetingMinutes = typeof meetingMinutes.$inferSelect;
export type InsertMeetingMinutes = z.infer<typeof insertMeetingMinutesSchema>;

// === CORRESPONDENCE MODULE ===

export const correspondence = pgTable("correspondence", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  correspondenceNumber: text("correspondence_number"),
  type: text("type").default("Letter").notNull(),
  subject: text("subject").notNull(),
  body: text("body"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  toName: text("to_name"),
  toEmail: text("to_email"),
  date: date("date").notNull(),
  status: text("status").default("Draft").notNull(),
  priority: text("priority").default("Normal"),
  attachments: text("attachments"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("correspondence_project_id_idx").on(table.projectId),
  index("correspondence_type_idx").on(table.type),
  index("correspondence_date_idx").on(table.date),
  uniqueIndex("correspondence_project_number_unique").on(table.projectId, table.correspondenceNumber),
]);

export const insertCorrespondenceSchema = createInsertSchema(correspondence).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Correspondence = typeof correspondence.$inferSelect;
export type InsertCorrespondence = z.infer<typeof insertCorrespondenceSchema>;

export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImageUrl: text("cover_image_url"),
  author: text("author").notNull().default("Friday Report Team"),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("blog_posts_slug_idx").on(table.slug),
  index("blog_posts_status_idx").on(table.status),
  index("blog_posts_published_at_idx").on(table.publishedAt),
]);

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

// User Acquisition - one row per user, captured at signup
export const userAcquisition = pgTable("user_acquisition", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  referrer: text("referrer"),
  referrerHost: text("referrer_host"),
  landingPath: text("landing_path"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmTerm: text("utm_term"),
  utmContent: text("utm_content"),
  gclid: text("gclid"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  country: text("country"),
  region: text("region"),
  city: text("city"),
  deviceType: text("device_type"),
  browser: text("browser"),
  os: text("os"),
  signupMethod: text("signup_method"),
  anonymousId: varchar("anonymous_id"),
  firstSeenAt: timestamp("first_seen_at"),
  signedUpAt: timestamp("signed_up_at").defaultNow(),
}, (table) => [
  index("user_acquisition_anonymous_id_idx").on(table.anonymousId),
  index("user_acquisition_signed_up_at_idx").on(table.signedUpAt),
]);

export type UserAcquisition = typeof userAcquisition.$inferSelect;
export type InsertUserAcquisition = typeof userAcquisition.$inferInsert;

// User Page Events - persisted page-view + click stream from frontend
export const userPageEvents = pgTable("user_page_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  anonymousId: varchar("anonymous_id"),
  sessionId: varchar("session_id"),
  eventType: text("event_type").notNull(), // 'page_view' | 'click' | 'custom'
  path: text("path"),
  element: text("element"),
  label: text("label"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(), // server-side time, used for caps/retention
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("user_page_events_user_id_occurred_at_idx").on(table.userId, table.occurredAt),
  index("user_page_events_anonymous_id_idx").on(table.anonymousId),
  index("user_page_events_created_at_idx").on(table.createdAt),
  index("user_page_events_session_id_idx").on(table.sessionId),
]);

export type UserPageEvent = typeof userPageEvents.$inferSelect;
export type InsertUserPageEvent = typeof userPageEvents.$inferInsert;

// === LinkedIn Enrichment & Follow-up Drafts (Task #25) ===

// Per-user LinkedIn / profile enrichment cache (1 row per user).
export const userEnrichment = pgTable("user_enrichment", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  source: text("source"),                  // 'proxycurl' | 'openai_inference' | 'manual' | 'none'
  status: text("status").default("ok"),    // 'ok' | 'error' | 'not_configured' | 'pending'
  errorMessage: text("error_message"),
  linkedinUrl: text("linkedin_url"),
  headline: text("headline"),
  currentRole: text("current_role"),
  currentCompany: text("current_company"),
  currentCompanyIndustry: text("current_company_industry"),
  location: text("location"),
  photoUrl: text("photo_url"),
  recentPositions: jsonb("recent_positions"), // [{title, company, startDate, endDate}]
  rawPayload: jsonb("raw_payload"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserEnrichment = typeof userEnrichment.$inferSelect;
export type InsertUserEnrichment = typeof userEnrichment.$inferInsert;

// Per-user AI-drafted follow-up messages, kept as a small history.
export const userFollowupDrafts = pgTable("user_followup_drafts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  authorId: varchar("author_id").references(() => users.id),
  authorName: text("author_name"),
  tone: text("tone").default("friendly"),  // 'friendly' | 'formal' | 'brief'
  subject: text("subject"),
  content: text("content").notNull(),
  status: text("status").default("draft"), // 'draft' | 'edited' | 'sent' | 'copied'
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_followup_drafts_user_idx").on(table.userId, table.createdAt),
]);

export type UserFollowupDraft = typeof userFollowupDrafts.$inferSelect;
export type InsertUserFollowupDraft = typeof userFollowupDrafts.$inferInsert;

// ===========================================================================
// Custom AI Agents (chat + scheduled). Built-ins (Friday, Power BI, Project
// Agent) are virtual; only user-built agents are persisted here.
// ===========================================================================

export const customAgents = pgTable("custom_agents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  type: text("type").notNull(),                     // 'chat' | 'scheduled'
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").default("Bot"),                // curated lucide icon name
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").notNull().default("gpt-4o-mini"), // 'gpt-4o' | 'gpt-4o-mini'
  dataScope: jsonb("data_scope").$type<{
    type: "org" | "portfolios" | "projects";
    portfolioIds?: number[];
    projectIds?: number[];
  }>().notNull().default({ type: "org" }),
  allowedTools: text("allowed_tools").array().notNull().default(sql`'{}'::text[]`),
  // 4 short, ready-to-send template questions auto-generated from the
  // systemPrompt at create/update time. Rendered as starter cards on the
  // agent's empty-state landing page so users can launch a conversation
  // with one click. Nullable until the first generation completes.
  suggestedPrompts: text("suggested_prompts").array(),
  visibility: text("visibility").notNull().default("private"), // 'private' | 'org' | 'members'
  // Scheduled-only:
  enabled: boolean("enabled").notNull().default(true),
  scheduleDay: integer("schedule_day"),             // 0-6 (Sun..Sat)
  scheduleTime: text("schedule_time"),              // HH:MM UTC
  timezone: text("timezone").default("America/New_York"),
  recipientEmails: text("recipient_emails").array(),
  emailSubject: text("email_subject"),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("custom_agents_org_idx").on(t.organizationId),
  index("custom_agents_creator_idx").on(t.createdBy),
  index("custom_agents_next_run_idx").on(t.nextRun),
]);

export const customAgentMembers = pgTable("custom_agent_members", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => customAgents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  uniqueIndex("custom_agent_members_unique").on(t.agentId, t.userId),
]);

export const customAgentConversations = pgTable("custom_agent_conversations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => customAgents.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  archivedAt: timestamp("archived_at"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("custom_agent_conversations_user_idx").on(t.agentId, t.userId, t.lastMessageAt),
]);

export const customAgentMessages = pgTable("custom_agent_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => customAgentConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),                     // 'user' | 'assistant'
  content: text("content").notNull(),
  attachments: jsonb("attachments").$type<{ name: string; type: string; size: number }[] | null>(),
  pageContext: jsonb("page_context").$type<Record<string, any> | null>(),
  // Per-message UI state. Mirrors `friday_messages.metadata` — currently
  // records the quick-reply chip the user picked on an assistant message
  // so the chips on that bubble can render with the chosen option
  // highlighted and the others muted on reload.
  metadata: jsonb("metadata").$type<{ quickReplySelection?: string } | null>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("custom_agent_messages_conv_idx").on(t.conversationId, t.createdAt),
]);

export const customAgentLogs = pgTable("custom_agent_logs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => customAgents.id, { onDelete: "cascade" }),
  status: text("status").notNull(),                 // 'success' | 'error' | 'skipped'
  subject: text("subject"),
  recipientEmails: text("recipient_emails").array(),
  emailPreview: text("email_preview"),
  errorMessage: text("error_message"),
  triggeredBy: varchar("triggered_by"),             // user id or 'cron'
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("custom_agent_logs_agent_idx").on(t.agentId, t.createdAt),
]);

export type CustomAgent = typeof customAgents.$inferSelect;
export type InsertCustomAgent = typeof customAgents.$inferInsert;
export type CustomAgentMember = typeof customAgentMembers.$inferSelect;
export type CustomAgentConversation = typeof customAgentConversations.$inferSelect;
export type CustomAgentMessage = typeof customAgentMessages.$inferSelect;
export type CustomAgentLog = typeof customAgentLogs.$inferSelect;

// Platform-level settings for the platform-built-in agents (Friday,
// Power BI Request, Project Agent, and the Onboarding directive that
// gets appended to Friday for first-time users / public previews).
// Singleton row per agent_key. Lets super admins disable an agent
// globally and/or override the default system prompt and model used by
// the service. NULL columns mean "use the service-baked default".
// Caching is handled in server/storage/builtinAgentSettingsStorage.ts.
export const BUILTIN_AGENT_KEYS = ["friday", "powerbi", "project_agent", "onboarding"] as const;
export type BuiltinAgentKey = (typeof BUILTIN_AGENT_KEYS)[number];

// Structured provider-credential blob set per built-in agent. Each section
// is optional — when missing the runtime falls back to the platform env
// vars (AZURE_OPENAI_*, OPENAI_API_KEY, ANTHROPIC_API_KEY). Only super
// admins can write these via /api/admin/agents/builtin/:key.
export const builtinAgentProviderConfigSchema = z.object({
  azure: z.object({
    endpoint: z.string().max(500).optional(),
    apiKey: z.string().max(500).optional(),
    deployment: z.string().max(200).optional(),
    apiVersion: z.string().max(50).optional(),
  }).partial().optional(),
  openai: z.object({
    apiKey: z.string().max(500).optional(),
    baseURL: z.string().max(500).optional(),
  }).partial().optional(),
  anthropic: z.object({
    apiKey: z.string().max(500).optional(),
  }).partial().optional(),
}).partial();

export type BuiltinAgentProviderConfig = z.infer<typeof builtinAgentProviderConfigSchema>;

// Default number of free questions a guest visitor on /ai gets before
// being asked to sign in. Used as the fallback when the per-agent
// override below is null. Kept in sync with the value advertised on the
// public landing page copy.
export const DEFAULT_GUEST_QUESTION_LIMIT = 5;

export const builtinAgentSettings = pgTable("builtin_agent_settings", {
  agentKey: text("agent_key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  defaultSystemPrompt: text("default_system_prompt"),
  defaultModel: text("default_model"),
  providerConfig: jsonb("provider_config").$type<BuiltinAgentProviderConfig>(),
  // Friday-only: number of free questions a guest visitor gets per
  // session on /ai before being asked to sign in. NULL = use the
  // platform default (DEFAULT_GUEST_QUESTION_LIMIT). Ignored for the
  // other built-in agent keys.
  guestQuestionLimit: integer("guest_question_limit"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BuiltinAgentSetting = typeof builtinAgentSettings.$inferSelect;
export type InsertBuiltinAgentSetting = typeof builtinAgentSettings.$inferInsert;

// Custom one-shot migration tracker used by `server/migrations/*` (e.g.
// `migrateMonthToCalendar`). Declared here so `drizzle-kit push` recognises
// the existing table instead of suggesting a rename to a new schema table.
export const metaMigrations = pgTable("_meta_migrations", {
  key: text("key").primaryKey(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
});
