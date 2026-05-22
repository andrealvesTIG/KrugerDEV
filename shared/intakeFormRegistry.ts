// Registry of every built-in field and "block" (composite section) that admins
// can place inside a configurable intake-form tab. The IntakeDetails page uses
// these keys to render dynamically; the Settings → Intake Form Layout editor
// uses them to populate the "add item" picker.

export type IntakeFieldInputType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "checkbox"
  | "portfolio"
  | "program"
  | "resource"
  | "readonly";

export type IntakeFieldReadonlyFormat = "date" | "datetime" | "text";

export interface IntakeFieldDefinition {
  key: string;            // matches the projectIntakes column name
  label: string;
  group: string;          // grouping shown in the picker
  inputType: IntakeFieldInputType;
  placeholder?: string;
  rows?: number;          // for textarea
  options?: { value: string; label: string }[];   // for select
  helpText?: string;
  // For inputType "readonly": how to format the stored value for display.
  readonlyFormat?: IntakeFieldReadonlyFormat;
}

// Every built-in projectIntakes field that should be placeable on the form.
export const INTAKE_FIELDS: IntakeFieldDefinition[] = [
  { key: "projectName", label: "Intake Name", group: "Basic Info", inputType: "text", placeholder: "Enter a descriptive name for this intake" },
  { key: "portfolioId", label: "Target Portfolio", group: "Basic Info", inputType: "portfolio" },
  { key: "description", label: "Description / Problem Statement", group: "Basic Info", inputType: "textarea", rows: 4, placeholder: "Describe the problem, opportunity, or request..." },
  {
    key: "fundingSource",
    label: "Funding Source",
    group: "Basic Info",
    inputType: "select",
    options: [
      { value: "Business Funded", label: "Business Funded" },
      { value: "IT Funded", label: "IT Funded" },
      { value: "Shared", label: "Shared Funding" },
      { value: "Capital", label: "Capital Budget" },
      { value: "Operating", label: "Operating Budget" },
    ],
  },
  {
    key: "businessUnit",
    label: "Requesting Business Unit",
    group: "Basic Info",
    inputType: "select",
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
  { key: "programId", label: "Related Program", group: "Basic Info", inputType: "program", helpText: "Lookup of programs defined for this organization." },
  { key: "managerResourceId", label: "Project Manager", group: "Basic Info", inputType: "resource", helpText: "Proposed Project Manager. Copied to the new project on approval." },

  { key: "estimatedBudget", label: "Estimated Total Budget", group: "Business Case", inputType: "number", placeholder: "0.00" },
  { key: "expectedBenefits", label: "Expected Benefits ($)", group: "Business Case", inputType: "number", placeholder: "0.00", helpText: "Total expected financial benefit. Used to auto-compute ROI." },
  { key: "capitalExpense", label: "Capital Expense (CapEx)", group: "Business Case", inputType: "number", placeholder: "0.00" },
  { key: "operatingExpense", label: "Operating Expense (OpEx)", group: "Business Case", inputType: "number", placeholder: "0.00" },
  { key: "financialJustification", label: "Business Justification & Expected Benefits", group: "Business Case", inputType: "textarea", rows: 4, placeholder: "Describe the business case, expected ROI, cost savings, revenue impact, or strategic benefits..." },
  { key: "costBenefitAnalysis", label: "Cost-Benefit Analysis", group: "Business Case", inputType: "textarea", rows: 3, placeholder: "Summarize the expected return on investment and payback period..." },

  { key: "itCostEstimate", label: "IT Cost Estimate", group: "Technical", inputType: "number", placeholder: "0.00" },
  { key: "resourceRequirements", label: "Resource Requirements", group: "Technical", inputType: "textarea", rows: 3, placeholder: "List required team members, skills, equipment, or external resources..." },
  { key: "implementationTimeline", label: "Implementation Timeline", group: "Technical", inputType: "textarea", rows: 3, placeholder: "Describe estimated phases, key milestones, and expected duration..." },
  { key: "architecturalReview", label: "Architectural Review Notes", group: "Technical", inputType: "textarea", rows: 3, placeholder: "Technical architecture considerations, integration points, infrastructure needs..." },

  { key: "cyberRiskAssessment", label: "Cybersecurity Risk Assessment", group: "Governance", inputType: "textarea", rows: 3, placeholder: "Identify security risks, data sensitivity, access requirements, and mitigation strategies..." },
  { key: "complianceRequirements", label: "Compliance Requirements", group: "Governance", inputType: "textarea", rows: 3, placeholder: "Regulatory requirements, data privacy (GDPR, HIPAA), industry standards..." },
  { key: "securityApproval", label: "Security Review Completed", group: "Governance", inputType: "checkbox", helpText: "Security review completed and approved" },

  // Read-only audit fields — populated by the server, surfaced through the
  // form layout editor like any other built-in field.
  { key: "createdAt",         label: "Created on",       group: "Audit", inputType: "readonly", readonlyFormat: "datetime" },
  { key: "updatedAt",         label: "Last modified on", group: "Audit", inputType: "readonly", readonlyFormat: "datetime" },
  { key: "updatedByName",     label: "Last modified by", group: "Audit", inputType: "readonly", readonlyFormat: "text" },
  { key: "currentStepLabel",  label: "Current step",     group: "Audit", inputType: "readonly", readonlyFormat: "text" },
];

export const INTAKE_FIELD_BY_KEY: Record<string, IntakeFieldDefinition> = Object.fromEntries(
  INTAKE_FIELDS.map(f => [f.key, f]),
);

// Composite blocks (whole sections / grids) that can be dropped into a tab.
export interface IntakeBlockDefinition {
  key: string;
  label: string;
  description: string;
}

export const INTAKE_BLOCKS: IntakeBlockDefinition[] = [
  { key: "custom_fields",            label: "Custom Fields",            description: "All custom fields defined for intakes." },
  { key: "financials_grid",          label: "Intake Estimates Grid",    description: "Multi-year CapEx / OpEx estimate grid." },
  { key: "architecture_questions",   label: "Architecture Questionnaire",   description: "Yes/No grid of architecture questions." },
  { key: "cybersecurity_questions",  label: "Cybersecurity Questionnaire",  description: "Yes/No grid of cybersecurity questions." },
  { key: "costing_checklist",        label: "Costing Checklist",            description: "Bottom-up costing grid (FTE days × rate, project / VT cost) per cost question." },
  { key: "budget_summary",           label: "Budget Remaining Summary",     description: "Auto-calculated CapEx + OpEx vs. Estimated Budget warning." },
  { key: "source_conversation",      label: "Source & AI Conversation",     description: "AI agent conversation and original attachments." },
];

export const INTAKE_BLOCK_BY_KEY: Record<string, IntakeBlockDefinition> = Object.fromEntries(
  INTAKE_BLOCKS.map(b => [b.key, b]),
);

export type IntakeTabItemType = "field" | "custom_field" | "block";
