// Default intake-form tab layout, mirroring the historical hard-coded 5-tab
// structure (Intake Details, Business Case, Technical Eval, Governance,
// Source & Conversation). Used to lazy-seed an organization's
// `intake_tabs` / `intake_tab_sections` / `intake_tab_items` rows the first
// time the layout is fetched, and to "Reset to defaults" from the editor.

export interface DefaultIntakeTabItem {
  itemType: "field" | "custom_field" | "block";
  itemKey: string;
  width: "full" | "half" | "third";
  isRequired?: boolean;
}

export interface DefaultIntakeTabSection {
  title: string;
  description?: string;
  items: DefaultIntakeTabItem[];
}

export interface DefaultIntakeTab {
  key: string;          // stable slug
  label: string;
  icon: string;         // lucide icon name
  sections: DefaultIntakeTabSection[];
}

export const DEFAULT_INTAKE_TABS: DefaultIntakeTab[] = [
  {
    key: "details",
    label: "Intake Details",
    icon: "Lightbulb",
    sections: [
      {
        title: "Intake Information",
        description: "Core details about this intake request.",
        items: [
          { itemType: "field", itemKey: "projectName",     width: "half", isRequired: true },
          { itemType: "field", itemKey: "portfolioId",     width: "half" },
          { itemType: "field", itemKey: "description",     width: "full", isRequired: true },
          { itemType: "field", itemKey: "fundingSource",   width: "third" },
          { itemType: "field", itemKey: "businessUnit",    width: "third" },
          { itemType: "field", itemKey: "programName",     width: "third" },
          { itemType: "block", itemKey: "custom_fields",   width: "full" },
        ],
      },
    ],
  },
  {
    key: "business-case",
    label: "Business Case",
    icon: "FileText",
    sections: [
      {
        title: "Business Case & Financial Justification",
        description: "Document the business value, expected benefits, and budget requirements.",
        items: [
          { itemType: "field", itemKey: "estimatedBudget",        width: "third" },
          { itemType: "field", itemKey: "capitalExpense",         width: "third" },
          { itemType: "field", itemKey: "operatingExpense",       width: "third" },
          { itemType: "block", itemKey: "budget_summary",         width: "full"  },
          { itemType: "field", itemKey: "financialJustification", width: "full"  },
          { itemType: "field", itemKey: "costBenefitAnalysis",    width: "full"  },
          { itemType: "block", itemKey: "financials_grid",        width: "full"  },
          { itemType: "block", itemKey: "costing_checklist",      width: "full"  },
        ],
      },
    ],
  },
  {
    key: "technical",
    label: "Technical Eval",
    icon: "Calculator",
    sections: [
      {
        title: "Technical Evaluation",
        description: "Assess technical feasibility, resource requirements, and implementation approach.",
        items: [
          { itemType: "field", itemKey: "itCostEstimate",         width: "full" },
          { itemType: "field", itemKey: "resourceRequirements",   width: "full" },
          { itemType: "field", itemKey: "implementationTimeline", width: "full" },
          { itemType: "field", itemKey: "architecturalReview",    width: "full" },
        ],
      },
    ],
  },
  {
    key: "governance",
    label: "Governance",
    icon: "Shield",
    sections: [
      {
        title: "Governance & Compliance Review",
        description: "Security assessment, compliance requirements, and approval tracking.",
        items: [
          { itemType: "field", itemKey: "cyberRiskAssessment",    width: "full" },
          { itemType: "field", itemKey: "complianceRequirements", width: "full" },
          { itemType: "field", itemKey: "securityApproval",       width: "full" },
          { itemType: "block", itemKey: "architecture_questions", width: "full" },
          { itemType: "block", itemKey: "cybersecurity_questions",width: "full" },
          { itemType: "block", itemKey: "pm_approval",            width: "full" },
        ],
      },
    ],
  },
  {
    key: "source",
    label: "Source & Conversation",
    icon: "MessageSquare",
    sections: [
      {
        title: "Source & AI Conversation",
        items: [
          { itemType: "block", itemKey: "source_conversation", width: "full" },
        ],
      },
    ],
  },
];
