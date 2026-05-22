/**
 * Cross-field validation for date custom fields that are paired through a
 * `days_between_dates` computed field. The computed field's `options` array
 * stores `[startDateFieldId, endDateFieldId]` as strings, so editing either
 * date in a pair must keep `start <= end` (otherwise the computed Duration
 * goes negative — see the user-reported `-280 days` regression).
 *
 * Returns a human-readable error message, or `null` if the proposed value is
 * valid. Empty / unparseable inputs are treated as valid here — required-ness
 * is enforced elsewhere.
 */
export interface DateValidationDef {
  id: number;
  name: string;
  fieldType: string;
  options: unknown;
}

export interface DateValidationValue {
  fieldDefinitionId: number;
  value: string | null;
}

export function findDatePairOrderError(
  definitions: DateValidationDef[],
  values: DateValidationValue[],
  fieldId: number,
  newValue: string | null,
): string | null {
  if (!newValue) return null;
  const proposed = new Date(newValue);
  if (Number.isNaN(proposed.getTime())) return null;

  for (const def of definitions) {
    if (def.fieldType !== "days_between_dates") continue;
    const opts = Array.isArray(def.options) ? (def.options as unknown[]) : [];
    const startId = parseInt(String(opts[0] ?? ""), 10);
    const endId = parseInt(String(opts[1] ?? ""), 10);
    if (!startId || !endId) continue;

    if (fieldId === startId) {
      const endRaw = values.find(v => v.fieldDefinitionId === endId)?.value;
      if (!endRaw) continue;
      const end = new Date(endRaw);
      if (Number.isNaN(end.getTime())) continue;
      if (proposed.getTime() > end.getTime()) {
        const endName = definitions.find(d => d.id === endId)?.name ?? "finish date";
        return `Start date cannot be later than ${endName}.`;
      }
    } else if (fieldId === endId) {
      const startRaw = values.find(v => v.fieldDefinitionId === startId)?.value;
      if (!startRaw) continue;
      const start = new Date(startRaw);
      if (Number.isNaN(start.getTime())) continue;
      if (proposed.getTime() < start.getTime()) {
        const startName = definitions.find(d => d.id === startId)?.name ?? "start date";
        return `Finish date cannot be earlier than ${startName}.`;
      }
    }
  }
  return null;
}
