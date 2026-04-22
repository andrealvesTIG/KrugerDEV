import { z } from "zod";

export type ProjectTabPlacement = "main" | "more";

export interface ProjectTabDefinition {
  id: string;
  label: string;
  placement: ProjectTabPlacement;
  moduleKey?: string;
}

export const PROJECT_TAB_DEFINITIONS: ProjectTabDefinition[] = [
  { id: "summary", label: "Summary", placement: "main" },
  { id: "tasks", label: "Tasks", placement: "main" },
  { id: "team", label: "Team", placement: "main" },
  { id: "risks", label: "Risks", placement: "main" },
  { id: "issues", label: "Issues", placement: "main" },
  { id: "financials", label: "Financials", placement: "main" },
  { id: "daily-logs", label: "Daily Logs", placement: "main", moduleKey: "daily-logs" },
  { id: "rfis", label: "RFIs", placement: "main", moduleKey: "rfis" },
  { id: "submittals", label: "Submittals", placement: "main", moduleKey: "submittals" },
  { id: "drawings", label: "Drawings", placement: "main", moduleKey: "drawings" },
  { id: "punch-list", label: "Punch List", placement: "main", moduleKey: "punch-list" },
  { id: "quality-safety", label: "Quality & Safety", placement: "main", moduleKey: "quality-safety" },
  { id: "bidding", label: "Bidding", placement: "main", moduleKey: "bidding" },
  { id: "change-orders", label: "Change Orders", placement: "main", moduleKey: "change-orders" },
  { id: "construction-invoices", label: "Payment Apps", placement: "main", moduleKey: "construction-invoices" },
  { id: "meetings", label: "Meetings", placement: "main", moduleKey: "meetings" },
  { id: "correspondence", label: "Correspondence", placement: "main", moduleKey: "correspondence" },
  { id: "scoring", label: "Scoring", placement: "more" },
  { id: "benefits", label: "Benefits", placement: "more" },
  { id: "decisions", label: "Decisions", placement: "more" },
  { id: "lessons-learned", label: "Lessons Learned", placement: "more" },
  { id: "change-requests", label: "Change Requests", placement: "more" },
  { id: "documents", label: "Documents", placement: "more" },
  { id: "invoices", label: "Invoices", placement: "more" },
  { id: "status-report", label: "Status Report", placement: "more" },
  { id: "ai-agent", label: "AI Agent", placement: "more" },
];

export const PROJECT_TAB_IDS: string[] = PROJECT_TAB_DEFINITIONS.map((t) => t.id);
export const PROJECT_TAB_ID_SET: Set<string> = new Set(PROJECT_TAB_IDS);

export const CUSTOM_TAB_ID_PREFIX = "custom-";
const CUSTOM_TAB_ID_PATTERN = /^custom-\d+$/;

export function isCustomProjectTabId(id: string): boolean {
  return CUSTOM_TAB_ID_PATTERN.test(id);
}

export function customProjectTabId(numericId: number | string): string {
  return `${CUSTOM_TAB_ID_PREFIX}${numericId}`;
}

export function isKnownProjectTabId(id: string): boolean {
  return PROJECT_TAB_ID_SET.has(id) || isCustomProjectTabId(id);
}

export const projectTabSettingsSchema = z.object({
  order: z.array(z.string()).default([]),
  hidden: z.array(z.string()).default([]),
});

export type ProjectTabSettings = z.infer<typeof projectTabSettingsSchema>;

export const DEFAULT_PROJECT_TAB_SETTINGS: ProjectTabSettings = {
  order: [...PROJECT_TAB_IDS],
  hidden: [],
};

/**
 * Resolve the org-level effective ordering of project tab ids (built-ins and
 * custom tabs), applying the org's saved order on top of the canonical list.
 * Unknown ids are dropped; canonical built-in ids missing from the saved order
 * are appended in their original position. If `customTabIds` is provided,
 * unknown custom ids are dropped and any custom ids not present in the saved
 * order are appended at the end (preserving the given creation order).
 */
export function resolveProjectTabOrder(
  settings: Partial<ProjectTabSettings> | null | undefined,
  customTabIds?: string[] | null,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const customAllowed = customTabIds ? new Set(customTabIds) : null;
  for (const id of settings?.order ?? []) {
    if (seen.has(id)) continue;
    if (PROJECT_TAB_ID_SET.has(id)) {
      seen.add(id);
      result.push(id);
    } else if (isCustomProjectTabId(id)) {
      if (customAllowed && !customAllowed.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of PROJECT_TAB_IDS) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  if (customTabIds) {
    for (const id of customTabIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export function resolveProjectTabHidden(
  settings: Partial<ProjectTabSettings> | null | undefined,
  customTabIds?: string[] | null,
): Set<string> {
  const customAllowed = customTabIds ? new Set(customTabIds) : null;
  return new Set(
    (settings?.hidden ?? []).filter((id) => {
      if (PROJECT_TAB_ID_SET.has(id)) return true;
      if (!isCustomProjectTabId(id)) return false;
      return customAllowed ? customAllowed.has(id) : true;
    }),
  );
}
