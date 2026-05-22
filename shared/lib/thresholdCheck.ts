/**
 * Threshold-check helper for the `threshold_check` computed custom field.
 *
 * Admin configures: one numeric source field, an operator, and a threshold
 * (default 0). The field displays Pass / Fail based on evaluating the source
 * value against the threshold.
 *
 * Storage shape on `customFieldDefinitions.options` (text[]):
 *   [sourceFieldId, operator, threshold]
 * e.g. ["42", ">", "0"]
 */

export type ThresholdOperator = ">" | ">=" | "<" | "<=" | "=" | "!=";

export const THRESHOLD_OPERATORS: ReadonlyArray<{ value: ThresholdOperator; label: string }> = [
  { value: ">", label: "> (greater than)" },
  { value: ">=", label: ">= (greater than or equal)" },
  { value: "<", label: "< (less than)" },
  { value: "<=", label: "<= (less than or equal)" },
  { value: "=", label: "= (equal to)" },
  { value: "!=", label: "!= (not equal to)" },
];

export function isThresholdOperator(op: unknown): op is ThresholdOperator {
  return op === ">" || op === ">=" || op === "<" || op === "<=" || op === "=" || op === "!=";
}

/**
 * Parse a stored options array into a typed config. Returns null when the
 * options are missing or malformed (e.g. source field deleted, bad operator).
 */
export function parseThresholdConfig(
  options: ReadonlyArray<string | null | undefined> | null | undefined,
): { sourceFieldId: number; operator: ThresholdOperator; threshold: number } | null {
  if (!options || options.length < 2) return null;
  const sourceFieldId = parseInt(String(options[0] ?? ""), 10);
  const operator = String(options[1] ?? "");
  const thresholdRaw = options[2];
  const threshold = thresholdRaw == null || thresholdRaw === "" ? 0 : parseFloat(String(thresholdRaw));
  if (!Number.isFinite(sourceFieldId)) return null;
  if (!isThresholdOperator(operator)) return null;
  if (!Number.isFinite(threshold)) return null;
  return { sourceFieldId, operator, threshold };
}

/**
 * Coerce a raw stored value into a finite number, or null when it cannot be
 * interpreted numerically. Treats empty / null / non-numeric as null so the
 * caller can show an empty state rather than a misleading Pass/Fail.
 */
export function coerceNumeric(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function evaluateThreshold(
  value: number,
  operator: ThresholdOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case "=": return value === threshold;
    case "!=": return value !== threshold;
  }
}

export function formatThresholdExpression(
  sourceLabel: string,
  operator: ThresholdOperator,
  threshold: number,
): string {
  return `${sourceLabel} ${operator} ${threshold}`;
}
