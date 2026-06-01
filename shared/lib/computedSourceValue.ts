/**
 * Resolve the numeric value of a custom field that may itself be a *computed*
 * field (rollup / roi / formula / days_between_dates). Plain stored fields just
 * return their persisted value.
 *
 * This exists because the `threshold_check` field reads a "source field" and
 * compares it against a threshold. When that source is a computed field, its
 * value is never written to `customFieldValues` — it is derived on the fly in
 * the UI. Reading the stored value therefore returns null and the threshold
 * (and any gate that depends on it) wrongly fails. Centralising the resolution
 * here keeps every threshold evaluation site in agreement with what the field
 * actually displays.
 */
import { coerceNumeric } from "./thresholdCheck";
import { computeRoi } from "./roi";
import { evaluateFormula } from "./formula";

export interface IntakeFinancialRow {
  capexAmount?: string | number | null;
  opexAmount?: string | number | null;
}

export interface StoredCustomFieldValue {
  fieldDefinitionId: number;
  value?: string | null;
}

export interface ComputedSourceFieldDef {
  id: number;
  fieldType?: string | null;
  options?: unknown;
}

export interface ComputedSourceContext {
  /** All custom field definitions, used to resolve the source's own type. */
  definitions: ReadonlyArray<ComputedSourceFieldDef>;
  /** Persisted custom field values for the entity. */
  values: ReadonlyArray<StoredCustomFieldValue>;
  /** Intake Estimates grid rows — required to resolve a `rollup` source. */
  financials?: ReadonlyArray<IntakeFinancialRow> | null;
  /** Owning entity, used to resolve an `roi` source. */
  entity?: { estimatedBudget?: unknown; expectedBenefits?: unknown } | null;
}

/**
 * Compute the numeric value of an `intake_financials` rollup field. Returns
 * null when there are no rows yet (mirrors the "—" empty state in the UI) so a
 * threshold over an unfilled grid stays in the "waiting" state rather than
 * silently evaluating against 0.
 */
export function computeRollupNumber(
  options: unknown,
  financials: ReadonlyArray<IntakeFinancialRow> | null | undefined,
): number | null {
  const opts = Array.isArray(options) ? (options as string[]) : [];
  const source = opts[0] || "intake_financials";
  const aggregate = opts[1] || "grand_total";
  if (source !== "intake_financials") return null;
  const rows = financials ?? [];
  if (rows.length === 0) return null;
  const totalCapex = rows.reduce((sum, r) => sum + (Number(r.capexAmount ?? 0) || 0), 0);
  const totalOpex = rows.reduce((sum, r) => sum + (Number(r.opexAmount ?? 0) || 0), 0);
  switch (aggregate) {
    case "total_capex":
      return totalCapex;
    case "total_opex":
      return totalOpex;
    case "year_count":
      return rows.length;
    case "grand_total":
    default:
      return totalCapex + totalOpex;
  }
}

/**
 * Resolve a source field's numeric value, computing it when the field is a
 * computed type. Returns null when the value cannot be interpreted numerically
 * (missing source, empty grid, missing ROI inputs, formula error, etc.).
 */
export function resolveSourceNumericValue(
  sourceFieldId: number,
  ctx: ComputedSourceContext,
): number | null {
  const storedRaw = ctx.values.find(v => v.fieldDefinitionId === sourceFieldId)?.value;
  const def = ctx.definitions.find(d => d.id === sourceFieldId);
  if (!def) return coerceNumeric(storedRaw);

  switch (def.fieldType) {
    case "rollup":
      return computeRollupNumber(def.options, ctx.financials);
    case "roi": {
      const { roiPercent } = computeRoi({
        totalCosts: ctx.entity?.estimatedBudget as number | string | null | undefined,
        totalBenefits: ctx.entity?.expectedBenefits as number | string | null | undefined,
      });
      return roiPercent;
    }
    case "formula": {
      const expr = Array.isArray(def.options) && (def.options as string[])[0]
        ? (def.options as string[])[0]
        : "";
      if (!expr) return null;
      const result = evaluateFormula(expr, (ref) => {
        const id = parseInt(ref, 10);
        if (!Number.isFinite(id)) return null;
        return ctx.values.find(v => v.fieldDefinitionId === id)?.value ?? null;
      });
      if (!result.ok) return null;
      if (typeof result.value === "boolean") return result.value ? 1 : 0;
      return Number.isFinite(result.value) ? result.value : null;
    }
    case "days_between_dates": {
      const opts = Array.isArray(def.options) ? (def.options as string[]) : [];
      const startId = parseInt(opts[0] ?? "", 10);
      const endId = parseInt(opts[1] ?? "", 10);
      if (!startId || !endId) return null;
      const sv = ctx.values.find(v => v.fieldDefinitionId === startId)?.value;
      const ev = ctx.values.find(v => v.fieldDefinitionId === endId)?.value;
      if (!sv || !ev) return null;
      const s = new Date(sv);
      const e = new Date(ev);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
      return Math.round((e.getTime() - s.getTime()) / 86_400_000);
    }
    default:
      return coerceNumeric(storedRaw);
  }
}
