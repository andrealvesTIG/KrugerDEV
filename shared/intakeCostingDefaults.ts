// Default Costing Checklist rows seeded the first time the grid is fetched
// for an intake. Mirrors the governance-questionnaire seeding pattern.

export const COSTING_CHECKLIST_CATEGORIES = [
  "PROCESS",
  "DATA",
  "APPLICATIONS",
  "CYBERSECURITY",
  "INFRASTRUCTURE",
  "DEPLOYMENT & CHANGE MANAGEMENT",
  "Hardware & Software Evaluation",
] as const;

export type CostingChecklistCategory = typeof COSTING_CHECKLIST_CATEGORIES[number];

export const FTE_PERMANENT_RATE_PER_DAY = 700;
export const FTE_CONSULTANT_RATE_PER_DAY = 1100;

export interface DefaultCostingChecklistRow {
  category: CostingChecklistCategory;
  question: string;
}

export const DEFAULT_COSTING_CHECKLIST: DefaultCostingChecklistRow[] = [
  { category: "PROCESS",      question: "Does a Process Analyst work need to be done?" },
  { category: "DATA",         question: "Does AI and Analytics work need to be done?" },
  { category: "APPLICATIONS", question: "Does Corporate Applications work need to be done?" },
  { category: "APPLICATIONS", question: "Does Business Solution Analyst work need to be done?" },
  { category: "APPLICATIONS", question: "Does Helpdesk work need to be done? (local installation, support)" },
  { category: "APPLICATIONS", question: "Does Custom Development need to be done by the vendor or in-house?" },
  { category: "CYBERSECURITY",question: "Does Security work need to be done?" },
  { category: "INFRASTRUCTURE", question: "Did you get approval of \"Security & Solution Architecture\"?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Does Infrastructure work need to be done?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Does Integration need to be done with existing systems?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Does Project Management work need to be done?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Does Change Management work need to be done?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Do you need to backfill Business Resources for the project?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Do you need to backfill IT operation resources for the project?" },
  { category: "DEPLOYMENT & CHANGE MANAGEMENT", question: "Does Training / User Documentation work need to be done?" },
  { category: "Hardware & Software Evaluation", question: "Does Hardware Equipment need to be purchased?" },
  { category: "Hardware & Software Evaluation", question: "Does Software Licenses need to be purchased? (if SAAS not used)" },
  { category: "Hardware & Software Evaluation", question: "Did CPU and User Licenses were reviewed?" },
  { category: "Hardware & Software Evaluation", question: "Do you have a recurrent SAAS or Software fees?" },
];
