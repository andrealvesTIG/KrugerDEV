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
  | "program"
  | "resource"
  | "datetime";

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
  {
    key: "businessUnit", label: "Requesting Business Unit", group: "Basic Info", inputType: "select",
    options: [
      { value: "HO", label: "Head Office" },
      { value: "IT", label: "Information Technology" },
      { value: "Finance", label: "Finance" },
      { value: "Operations", label: "Operations" },
      { value: "Sales", label: "Sales" },
      { value: "Marketing", label: "Marketing" },
      { value: "HR", label: "Human Resources" },
      { value: "Legal", label: "Legal" },
    ],
  },
  { key: "category",        label: "Category",      group: "Basic Info", inputType: "text" },
  { key: "source",          label: "Source",        group: "Basic Info", inputType: "text" },
  { key: "description",     label: "Description",   group: "Basic Info", inputType: "textarea", rows: 4, placeholder: "Describe the project…" },

  // Status & health
  {
    key: "priority", label: "Priority", group: "Status & Health", inputType: "select",
    options: [
      { value: "Low",      label: "Low" },
      { value: "Medium",   label: "Medium" },
      { value: "High",     label: "High" },
      { value: "Critical", label: "Critical" },
    ],
  },
  {
    key: "health", label: "Health", group: "Status & Health", inputType: "select",
    options: [
      { value: "Green",  label: "Green" },
      { value: "Yellow", label: "Yellow" },
      { value: "Red",    label: "Red" },
    ],
  },
  { key: "healthReason", label: "Health Reason", group: "Status & Health", inputType: "textarea", rows: 3 },
  {
    key: "riskLevel", label: "Risk Level", group: "Status & Health", inputType: "select",
    options: [
      { value: "Low",    label: "Low" },
      { value: "Medium", label: "Medium" },
      { value: "High",   label: "High" },
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
  { key: "programId",         label: "Program",         group: "People", inputType: "program" },

  // Scope & narrative
  { key: "scope",            label: "Scope",            group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "objectives",       label: "Objectives",       group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "successCriteria",  label: "Success Criteria", group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "constraints",      label: "Constraints",      group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "assumptions",      label: "Assumptions",      group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "dependencies",     label: "Dependencies",     group: "Scope & Narrative", inputType: "textarea", rows: 3 },
  { key: "businessValue",    label: "Business Value",   group: "Scope & Narrative", inputType: "text" },
  { key: "notes",            label: "Notes",            group: "Scope & Narrative", inputType: "textarea", rows: 3 },

  // Audit (read-only)
  { key: "createdAt", label: "Created At",      group: "Audit", inputType: "datetime", helpText: "Date and time the project was created." },
  { key: "updatedAt", label: "Last Updated At", group: "Audit", inputType: "datetime", helpText: "Date and time the project was last modified." },

  // Gates Information Summary
  { key: "activeGateStartedAt", label: "Active Gate Date Started", group: "Gates", inputType: "date", helpText: "When the current workflow gate began." },
  { key: "nextGate",            label: "Next Gate",                group: "Gates", inputType: "text", placeholder: "e.g., G2" },
  { key: "nextGateTargetDate",  label: "Next Gate Target Date",    group: "Gates", inputType: "date" },
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
  { key: "executive_summaries", label: "Executive Summaries", description: "Table of executive summary records linked to this project, with create / add existing / edit / remove actions." },
  { key: "pmo_comments", label: "PMO Comments", description: "Table of PMO comment records linked to this project, with create / add existing / edit / remove actions." },
  { key: "software_licenses", label: "Software / Licenses", description: "Table of vendor software & licensing records for this project (vendor, software name, opex start date, cost, renewal frequency, type)." },
];

export const PROJECT_FORM_BLOCK_BY_KEY: Record<string, ProjectBlockDefinition> = Object.fromEntries(
  PROJECT_FORM_BLOCKS.map(b => [b.key, b]),
);

export type ProjectFormItemType = "field" | "custom_field" | "block";
