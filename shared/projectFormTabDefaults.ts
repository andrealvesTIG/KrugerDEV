// Default project-form tab layout. Used to lazy-seed an organization's
// `project_form_tabs` / `_sections` / `_items` rows on first fetch, and to
// "Reset to defaults" from the Settings → Governance → Project Form editor.

export interface DefaultProjectFormItem {
  itemType: "field" | "custom_field" | "block";
  itemKey: string;
  width: "full" | "half" | "third";
}

export interface DefaultProjectFormSection {
  title: string;
  description?: string;
  width?: "full" | "half" | "third";
  items: DefaultProjectFormItem[];
}

export interface DefaultProjectFormTab {
  key: string;
  label: string;
  icon: string;
  sections: DefaultProjectFormSection[];
}

export const DEFAULT_PROJECT_FORM_TABS: DefaultProjectFormTab[] = [
  {
    key: "overview",
    label: "Overview",
    icon: "FileText",
    sections: [
      {
        title: "Project Information",
        description: "Core details about the project.",
        items: [
          { itemType: "field", itemKey: "name",         width: "half" },
          { itemType: "field", itemKey: "projectCode",  width: "half" },
          { itemType: "field", itemKey: "projectType",  width: "third" },
          { itemType: "field", itemKey: "methodology",  width: "third" },
          { itemType: "field", itemKey: "category",     width: "third" },
          { itemType: "field", itemKey: "department",   width: "half" },
          { itemType: "field", itemKey: "priority",     width: "half" },
          { itemType: "field", itemKey: "description",  width: "full" },
        ],
      },
      {
        title: "Health & Risk",
        items: [
          { itemType: "field", itemKey: "health",       width: "third" },
          { itemType: "field", itemKey: "riskLevel",    width: "third" },
          { itemType: "field", itemKey: "billableStatus", width: "third" },
          { itemType: "field", itemKey: "healthReason", width: "full" },
        ],
      },
      {
        title: "People",
        items: [
          { itemType: "field", itemKey: "managerResourceId", width: "half" },
          { itemType: "field", itemKey: "portfolioId",       width: "half" },
        ],
      },
    ],
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: "CalendarDays",
    sections: [
      {
        title: "Dates",
        items: [
          { itemType: "field", itemKey: "startDate",            width: "half" },
          { itemType: "field", itemKey: "endDate",              width: "half" },
          { itemType: "field", itemKey: "baselineStartDate",    width: "half" },
          { itemType: "field", itemKey: "baselineEndDate",      width: "half" },
          { itemType: "field", itemKey: "actualStartDate",      width: "half" },
          { itemType: "field", itemKey: "actualEndDate",        width: "half" },
          { itemType: "field", itemKey: "completionPercentage", width: "third" },
        ],
      },
    ],
  },
  {
    key: "financials",
    label: "Financials",
    icon: "DollarSign",
    sections: [
      {
        title: "Budget & Cost",
        items: [
          { itemType: "field", itemKey: "budget",           width: "third" },
          { itemType: "field", itemKey: "actualCost",       width: "third" },
          { itemType: "field", itemKey: "forecastCost",     width: "third" },
          { itemType: "field", itemKey: "scheduleVariance", width: "half" },
          { itemType: "field", itemKey: "costVariance",     width: "half" },
        ],
      },
    ],
  },
  {
    key: "scope",
    label: "Scope & Notes",
    icon: "ClipboardList",
    sections: [
      {
        title: "Scope & Objectives",
        items: [
          { itemType: "field", itemKey: "scope",           width: "full" },
          { itemType: "field", itemKey: "objectives",      width: "full" },
          { itemType: "field", itemKey: "successCriteria", width: "full" },
          { itemType: "field", itemKey: "constraints",     width: "full" },
          { itemType: "field", itemKey: "assumptions",     width: "full" },
          { itemType: "field", itemKey: "dependencies",    width: "full" },
          { itemType: "field", itemKey: "businessValue",   width: "half" },
          { itemType: "field", itemKey: "source",          width: "half" },
          { itemType: "field", itemKey: "notes",           width: "full" },
        ],
      },
      {
        title: "Custom Fields",
        items: [
          { itemType: "block", itemKey: "custom_fields", width: "full" },
        ],
      },
    ],
  },
];
