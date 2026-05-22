import { describe, it, expect } from "vitest";
import { computeRoi, formatRoiPercent } from "../shared/lib/roi";

describe("computeRoi", () => {
  it("returns positive ROI when benefits exceed costs", () => {
    expect(computeRoi({ totalCosts: 100, totalBenefits: 150 }).roiPercent).toBe(50);
  });

  it("returns negative ROI when benefits are below costs", () => {
    expect(computeRoi({ totalCosts: 200, totalBenefits: 50 }).roiPercent).toBe(-75);
  });

  it("returns zero when benefits equal costs", () => {
    expect(computeRoi({ totalCosts: 100, totalBenefits: 100 }).roiPercent).toBe(0);
  });

  it("returns null when costs are zero or negative", () => {
    expect(computeRoi({ totalCosts: 0, totalBenefits: 100 }).roiPercent).toBeNull();
    expect(computeRoi({ totalCosts: -50, totalBenefits: 100 }).roiPercent).toBeNull();
  });

  it("returns null when costs are missing", () => {
    expect(computeRoi({ totalCosts: null, totalBenefits: 100 }).roiPercent).toBeNull();
    expect(computeRoi({ totalCosts: undefined, totalBenefits: 100 }).roiPercent).toBeNull();
  });

  it("returns null when benefits are missing (no zero-coercion)", () => {
    expect(computeRoi({ totalCosts: 100, totalBenefits: null }).roiPercent).toBeNull();
    expect(computeRoi({ totalCosts: 100, totalBenefits: undefined }).roiPercent).toBeNull();
    expect(computeRoi({ totalCosts: 100, totalBenefits: "" }).roiPercent).toBeNull();
  });

  it("coerces numeric strings", () => {
    expect(computeRoi({ totalCosts: "200", totalBenefits: "300" }).roiPercent).toBe(50);
  });

  it("returns null for non-numeric strings", () => {
    expect(computeRoi({ totalCosts: "abc", totalBenefits: 100 }).roiPercent).toBeNull();
    expect(computeRoi({ totalCosts: 100, totalBenefits: "abc" }).roiPercent).toBeNull();
  });
});

describe("explainMissingRoi", () => {
  it("returns null when ROI is computable", async () => {
    const { explainMissingRoi } = await import("../shared/lib/roi");
    expect(explainMissingRoi({ totalCosts: 100, totalBenefits: 150 })).toBeNull();
  });

  it("explains missing costs", async () => {
    const { explainMissingRoi } = await import("../shared/lib/roi");
    expect(explainMissingRoi({ totalCosts: null, totalBenefits: 100 })).toMatch(/Costs are missing/);
  });

  it("explains missing benefits", async () => {
    const { explainMissingRoi } = await import("../shared/lib/roi");
    expect(explainMissingRoi({ totalCosts: 100, totalBenefits: null })).toMatch(/Benefits are missing/);
  });

  it("explains zero costs", async () => {
    const { explainMissingRoi } = await import("../shared/lib/roi");
    expect(explainMissingRoi({ totalCosts: 0, totalBenefits: 100 })).toMatch(/greater than zero/);
  });
});

describe("formatRoiPercent", () => {
  it("formats numbers with default 1 decimal place", () => {
    expect(formatRoiPercent(12.345)).toBe("12.3%");
    expect(formatRoiPercent(-7.5)).toBe("-7.5%");
    expect(formatRoiPercent(0)).toBe("0.0%");
  });

  it("returns em dash for null or non-finite", () => {
    expect(formatRoiPercent(null)).toBe("—");
    expect(formatRoiPercent(Number.NaN)).toBe("—");
    expect(formatRoiPercent(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("honours custom fraction digits", () => {
    expect(formatRoiPercent(12.345, 2)).toBe("12.35%");
    expect(formatRoiPercent(12.345, 0)).toBe("12%");
  });
});
