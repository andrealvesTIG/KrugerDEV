// Shared validator for per-step value-based gate rules ("field must equal one
// of these allowed values"). Used by:
//   - server/routes/intakeRoutes.ts   (gate transition enforcement)
//   - server/routes/projectRoutes.ts  (status transition enforcement)
//   - client/src/components/workflow/WorkflowStepRequirementsDialog.tsx
//
// Field-key convention matches `requiredFields`:
//   - built-in entity columns   → bare key, e.g. "status", "priority"
//   - per-org custom fields     → "cf:<definitionId>"

export interface AllowedValuesRule {
  allowedValues: string[];
}

export type FieldRules = Record<string, AllowedValuesRule>;

// Defensive parser. The column is jsonb so it could legitimately be null, an
// empty object, or a malformed payload (e.g. from a manual SQL edit). Returns
// only the well-formed entries.
export function parseFieldRules(raw: unknown): FieldRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FieldRules = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const allowed = (value as any).allowedValues;
    if (!Array.isArray(allowed)) continue;
    const cleaned = allowed
      .filter((v: unknown) => typeof v === 'string')
      .map((v: string) => v);
    if (cleaned.length === 0) continue;
    out[key] = { allowedValues: cleaned };
  }
  return out;
}

// Normalise a stored value for equality comparison against allowedValues.
// Returns null for "no value" so callers can distinguish blank vs. mismatch.
export function normaliseRuleValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

export interface FieldRuleError {
  fieldKey: string;
  label: string;
  message: string;
}

// Evaluate a single rule. Returns an error object when violated, else null.
// `getCurrentValue` returns the raw value as held by the entity / draft / cf
// value row (string for custom fields, native column type for built-ins).
export function evaluateFieldRule(
  fieldKey: string,
  rule: AllowedValuesRule,
  label: string,
  rawValue: unknown,
  prefix: string = '',
): FieldRuleError | null {
  if (!rule.allowedValues || rule.allowedValues.length === 0) return null;
  const v = normaliseRuleValue(rawValue);
  if (v === null) {
    // Blank fails any allowed-values rule — blank can never be "one of" a
    // non-empty allowed list. This matches the agreed semantics: a value rule
    // implies the field must also be present.
    return {
      fieldKey,
      label,
      message: `${prefix}${label} must be one of: ${rule.allowedValues.join(', ')}`,
    };
  }
  if (!rule.allowedValues.includes(v)) {
    return {
      fieldKey,
      label,
      message: `${prefix}${label} must be one of: ${rule.allowedValues.join(', ')} (currently "${v}")`,
    };
  }
  return null;
}
