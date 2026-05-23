// Shared helper for "Required when…" rules on custom field definitions.
// A rule makes the target field required only when another field's current
// value matches the configured operator/value. When a rule is present it
// supersedes the boolean `isRequired` flag on the same definition.

export type RequiredWhenOperator =
  | "equals"
  | "not_equals"
  | "is_empty"
  | "is_not_empty"
  | "contains";

export interface RequiredWhenRule {
  fieldDefinitionId: number;
  operator: RequiredWhenOperator;
  value?: string | null;
}

export function isValidRequiredWhenRule(x: unknown): x is RequiredWhenRule {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  if (typeof r.fieldDefinitionId !== "number" || !Number.isFinite(r.fieldDefinitionId)) return false;
  const op = r.operator;
  if (op !== "equals" && op !== "not_equals" && op !== "is_empty" && op !== "is_not_empty" && op !== "contains") return false;
  if ((op === "equals" || op === "not_equals" || op === "contains") && typeof r.value !== "string") return false;
  return true;
}

export function parseRequiredWhen(raw: unknown): RequiredWhenRule | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return null; }
  }
  return isValidRequiredWhenRule(parsed) ? parsed : null;
}

// Normalizes a stored custom-field value (which is a string for most types,
// JSON for multiselect/attachment, "true"/"false" for checkbox) into a
// trimmed string for rule comparison.
function normalizeForCompare(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try { return JSON.stringify(raw); } catch { return ""; }
}

export function evaluateRequiredWhen(
  rule: RequiredWhenRule,
  lookupValue: (fieldDefinitionId: number) => unknown,
): boolean {
  const raw = lookupValue(rule.fieldDefinitionId);
  const v = normalizeForCompare(raw);
  switch (rule.operator) {
    case "is_empty":
      return v.length === 0;
    case "is_not_empty":
      return v.length > 0;
    case "equals":
      return v === (rule.value ?? "").trim();
    case "not_equals":
      return v !== (rule.value ?? "").trim();
    case "contains":
      return v.toLowerCase().includes((rule.value ?? "").trim().toLowerCase());
    default:
      return false;
  }
}

// Returns true when the field should be required given the current values.
// `def` may have `requiredWhen` (object or JSON string) and/or `isRequired`.
export function isCustomFieldEffectivelyRequired(
  def: { isRequired?: boolean | null; requiredWhen?: unknown },
  lookupValue: (fieldDefinitionId: number) => unknown,
): boolean {
  // Never throw out of this helper — it runs on every render of a custom
  // field label. A malformed rule or a flaky lookup should fall back to the
  // static `isRequired` flag rather than crash the page.
  try {
    const rule = parseRequiredWhen(def?.requiredWhen);
    if (rule) return evaluateRequiredWhen(rule, lookupValue);
  } catch {
    // ignore and fall through
  }
  return !!def?.isRequired;
}

export const REQUIRED_WHEN_OPERATORS: { value: RequiredWhenOperator; label: string; needsValue: boolean }[] = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "not_equals", label: "does not equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "is_not_empty", label: "is filled in", needsValue: false },
  { value: "is_empty", label: "is empty", needsValue: false },
];
