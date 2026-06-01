import { describe, it, expect } from "vitest";
import {
  computeRollupNumber,
  resolveSourceNumericValue,
  type ComputedSourceContext,
} from "../shared/lib/computedSourceValue";

describe("computeRollupNumber", () => {
  const rows = [
    { capexAmount: "1000", opexAmount: "500" },
    { capexAmount: "2000", opexAmount: "1500" },
  ];

  it("sums grand_total across rows", () => {
    expect(computeRollupNumber(["intake_financials", "grand_total"], rows)).toBe(5000);
  });

  it("sums total_capex / total_opex", () => {
    expect(computeRollupNumber(["intake_financials", "total_capex"], rows)).toBe(3000);
    expect(computeRollupNumber(["intake_financials", "total_opex"], rows)).toBe(2000);
  });

  it("counts rows for year_count", () => {
    expect(computeRollupNumber(["intake_financials", "year_count"], rows)).toBe(2);
  });

  it("defaults to grand_total when aggregate missing", () => {
    expect(computeRollupNumber(["intake_financials"], rows)).toBe(5000);
  });

  it("returns null when no rows yet", () => {
    expect(computeRollupNumber(["intake_financials", "grand_total"], [])).toBeNull();
    expect(computeRollupNumber(["intake_financials", "grand_total"], null)).toBeNull();
  });

  it("returns null for an unsupported source", () => {
    expect(computeRollupNumber(["something_else", "grand_total"], rows)).toBeNull();
  });
});

describe("resolveSourceNumericValue", () => {
  it("resolves a rollup source from intake financials (the gate bug)", () => {
    const ctx: ComputedSourceContext = {
      definitions: [
        { id: 10, fieldType: "rollup", options: ["intake_financials", "grand_total"] },
      ],
      values: [],
      financials: [
        { capexAmount: "3000", opexAmount: "2000" },
      ],
    };
    expect(resolveSourceNumericValue(10, ctx)).toBe(5000);
  });

  it("returns null for a rollup with an empty grid", () => {
    const ctx: ComputedSourceContext = {
      definitions: [
        { id: 10, fieldType: "rollup", options: ["intake_financials", "grand_total"] },
      ],
      values: [],
      financials: [],
    };
    expect(resolveSourceNumericValue(10, ctx)).toBeNull();
  });

  it("reads a plain stored numeric field", () => {
    const ctx: ComputedSourceContext = {
      definitions: [{ id: 5, fieldType: "number" }],
      values: [{ fieldDefinitionId: 5, value: "42" }],
    };
    expect(resolveSourceNumericValue(5, ctx)).toBe(42);
  });

  it("resolves an roi source from the entity", () => {
    const ctx: ComputedSourceContext = {
      definitions: [{ id: 7, fieldType: "roi" }],
      values: [],
      entity: { estimatedBudget: "100", expectedBenefits: "150" },
    };
    expect(resolveSourceNumericValue(7, ctx)).toBeCloseTo(50);
  });

  it("resolves a formula source referencing stored fields", () => {
    const ctx: ComputedSourceContext = {
      definitions: [{ id: 9, fieldType: "formula", options: ["{1} + {2}"] }],
      values: [
        { fieldDefinitionId: 1, value: "10" },
        { fieldDefinitionId: 2, value: "5" },
      ],
    };
    expect(resolveSourceNumericValue(9, ctx)).toBe(15);
  });

  it("resolves a days_between_dates source", () => {
    const ctx: ComputedSourceContext = {
      definitions: [{ id: 3, fieldType: "days_between_dates", options: ["1", "2"] }],
      values: [
        { fieldDefinitionId: 1, value: "2026-01-01" },
        { fieldDefinitionId: 2, value: "2026-01-11" },
      ],
    };
    expect(resolveSourceNumericValue(3, ctx)).toBe(10);
  });

  it("falls back to the stored value when the source field no longer exists", () => {
    const ctx: ComputedSourceContext = {
      definitions: [],
      values: [{ fieldDefinitionId: 99, value: "8" }],
    };
    expect(resolveSourceNumericValue(99, ctx)).toBe(8);
  });
});
