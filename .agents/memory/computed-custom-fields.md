---
name: Computed custom fields are never persisted
description: Why threshold/gate logic over a computed source field silently fails, and the shared fix
---

# Computed custom fields are never stored in customFieldValues

Custom field types `rollup`, `roi`, `formula`, `days_between_dates`, `rag_rollup`,
and `threshold_check` are **computed on the fly in the UI** — their values are
NEVER written to the `customFieldValues` table. Only "input" field types are
persisted.

**Why this bites:** any consumer that reads a computed field's value via
`cfValues.find(cv => cv.fieldDefinitionId === id)?.value` gets `null`. The
classic symptom: a `threshold_check` gate over a `rollup` source (e.g. "Total
Intake Amount" = sum of intake financials) always fails its gate even though the
UI shows a real number like $5,000.

**How to apply:** when evaluating a `threshold_check` (or anything that reads a
source field that might itself be computed), resolve the source's numeric value
through `shared/lib/computedSourceValue.ts` (`resolveSourceNumericValue`), which
computes rollup/roi/formula/days_between_dates and falls back to the stored value
for plain fields. A `rollup` needs the intake financials grid rows; an `roi`
needs the intake entity's `estimatedBudget`/`expectedBenefits`. Threshold
evaluation is duplicated across `IntakeSingleCustomField`,
`WorkflowStepRequirementsDialog`, and `IntakeDetails.validateGate` — keep all
sites using the shared resolver, and make sure any `useMemo` that calls it lists
the financials/values/defs/entity it reads in its dependency array, or results go
stale after async loads.
