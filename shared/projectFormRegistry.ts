// Registry of every built-in field and "block" (composite section) that admins
// can place inside a configurable project-form tab. ProjectDetails uses these
// keys to render the Summary area dynamically; the Settings → Governance →
// Project Form editor uses them to populate the "add item" picker.

export type ProjectFieldInputType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "percentage"
  | "date"
  | "select"
  | "checkbox"
  | "portfolio"
  | "resource";

export interface ProjectFieldDefinition {
  key: string;            // matches the projects column name
  label: string;
  group: string;          // grouping shown in the picker
  inputType: ProjectFieldInputType;
  placeholder?: string;
  rows?: number;          // for textarea
  options?: { value: string; label: string }[];   // for select
  helpText?: string;
}

export const PROJECT_FORM_FIELDS: ProjectFieldDefinition[] = [
  // Basic info
  { key: "name",            label: "Project Name",  group: "Basic Info", inputType: "text", placeholder: "Project name" },
  { key: "projectCode",     label: "Project Code",  group: "Basic Info", inputType: "text", placeholder: "Internal code" },
  { key: "projectType",     label: "Project Type",  group: "Basic Info", inputType: "text" },
  { key: "methodology",     label: "Methodology",   group: "Basic Info", inputType: "text" },
  { key: "department",      label: "Department",    group: "Basic Info", inputType: "text" },
  { key: "category",        label: "Category",      group: "Basic Info", inputType: "text" },
  { key: "source",          label: "Source",        group: "Basic Info", inputType: "text" },
  { key: "description",     label: "Description",   group: "Basic Info", inputType: "textarea", rows: 4, placeholder: "Describe the project…" },

  // Status & health
  {
    key: "priority", label: "Priority", group: "Status & Health", inputType: "select",
    options: [
      { value: "low",      label: "Low" },
      { value: "medium",   label: "Medium" },
      { value: "high",     label: "High" },
      { value: "critical", label: "Critical" },
    ],
  },
  {
    key: "health", label: "Health", group: "Status & Health", inputType: "select",
    options: [
      { value: "green",  label: "Green" },
      { value: "yellow", label: "Yellow" },
      { value: "red",    label: "Red" },
    ],
  },
  { key: "healthReason", label: "Health Reason", group: "Status & Health", inputType: "textarea", rows: 3 },
  {
    key: "riskLevel", label: "Risk Level", group: "Status & Health", inputType: "select",
    options: [
      { value: "low",    label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high",   label: "High" },
    ],
  },
  {
    key: "billableStatus", label: "Billable Status", group: "Status & Health", inputType: "select",
    options: [
      { value: "billable",     label: "Billable" },
      { value: "non-billable", label: "Non-Billable" },
      { value: "internal",     label: "Internal" },
    ],
  },

  // Schedule
  { key: "startDate",         label: "Start Date",          group: "Schedule", inputType: "date" },
  { key: "endDate",           label: "End Date",            group: "Schedule", inputType: "date" },
  { key: "baselineStartDate", label: "Baseline Start Date", group: "Schedule", inputType: "date" },
  { key: "baselineEndDate",   label: "Baseline End Date",   group: "Schedule", inputType: "date" },
  { key: "actualStartDate",   label: "Actual Start Date",   group: "Schedule", inputType: "date" },
  { key: "actualEndDate",     label: "Actual End Date",     group: "Schedule", inputType: "date" },
  { key: "completionPercentage", label: "Completion %",     group: "Schedule", inputType: "percentage" },

  // Financials
  { key: "budget",           label: "Budget",            group: "Financials", inputType: "currency" },
  { key: "actualCost",       label: "Actual Cost",       group: "Financials", inputType: "currency" },
  { key: "forecastCost",     label: "Forecast Cost",     group: "Financials", inputType: "currency" },
  { key: "scheduleVariance", label: "Schedule Variance", group: "Financials", inputType: "number" },
  { key: "costVariance",     label: "Cost Variance",     group: "Financials", inputType: "number" },

  // People
  { key: "managerResourceId", label: "Project Manager", group: "People", inputType: "resource" },
  { key: "portfolioId",       label: "Portfolio",       group: "People", inputType: "portfolio" },

  // Scope & narrative
  { key: "scope",            label: "Scope",            group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "objectives",       label: "Objectives",       group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "successCriteria",  label: "Success Criteria", group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "constraints",      label: "Constraints",      group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "assumptions",      label: "Assumptions",      group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "dependencies",     label: "Dependencies",     group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "businessValue",    label: "Business Value",   group: "Scope & Narrative", inputType: "text" },
  { key: "notes",            label: "Notes",            group: "Scope & Narrative", inputType: "textarea", rows: 3 },
];

export const PROJECT_FORM_FIELD_BY_KEY: Record<string, ProjectFieldDefinition> = Object.fromEntries(
  PROJECT_FORM_FIELDS.map(f => [f.key, f]),
);

// Composite blocks (whole sections / grids) that can be dropped into a tab.
export interface ProjectBlockDefinition {
  key: string;
  label: string;
  description: string;
}

export const PROJECT_FORM_BLOCKS: ProjectBlockDefinition[] = [
  { key: "custom_fields", label: "Custom Fields", description: "All custom fields defined for projects (excluding any individually placed above)." },
];

export const PROJECT_FORM_BLOCK_BY_KEY: Record<string, ProjectBlockDefinition> = Object.fromEntries(
  PROJECT_FORM_BLOCKS.map(b => [b.key, b]),
);

export type ProjectFormItemType = "field" | "custom_field" | "block";
