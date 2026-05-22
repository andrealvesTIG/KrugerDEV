/**
 * RAG (Red / Amber-Yellow / Green) rollup helper.
 *
 * Used by the `rag_rollup` computed custom field type: an admin picks a set
 * of source `rag` custom fields, and the rollup field's displayed value is
 * the *worst* status across those sources.
 *
 * Severity order (worst first): Red > Yellow > Green. Empty / unrecognised
 * source values are ignored. When no source has a value the rollup is empty.
 */

export type RagStatus = "Red" | "Yellow" | "Green";

const SEVERITY: Record<RagStatus, number> = {
  Red: 3,
  Yellow: 2,
  Green: 1,
};

function normalize(raw: unknown): RagStatus | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === "red") return "Red";
  if (v === "yellow" || v === "amber") return "Yellow";
  if (v === "green") return "Green";
  return null;
}

export function computeWorstRag(values: ReadonlyArray<unknown>): RagStatus | null {
  let worst: RagStatus | null = null;
  for (const raw of values) {
    const v = normalize(raw);
    if (!v) continue;
    if (!worst || SEVERITY[v] > SEVERITY[worst]) worst = v;
  }
  return worst;
}
