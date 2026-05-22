import { describe, it, expect } from "vitest";
import {
  parseThresholdConfig,
  evaluateThreshold,
  coerceNumeric,
  isThresholdOperator,
} from "../shared/lib/thresholdCheck";
import { evaluateFormula, extractFormulaReferences } from "../shared/lib/formula";

describe("thresholdCheck", () => {
  it("parses a valid config", () => {
    expect(parseThresholdConfig(["42", ">", "10"])).toEqual({
      sourceFieldId: 42,
      operator: ">",
      threshold: 10,
    });
  });

  it("defaults threshold to 0 when missing", () => {
    expect(parseThresholdConfig(["42", ">"])).toEqual({
      sourceFieldId: 42,
      operator: ">",
      threshold: 0,
    });
  });

  it("rejects malformed configs", () => {
    expect(parseThresholdConfig(null)).toBeNull();
    expect(parseThresholdConfig([])).toBeNull();
    expect(parseThresholdConfig(["abc", ">", "0"])).toBeNull();
    expect(parseThresholdConfig(["42", "bogus", "0"])).toBeNull();
    expect(parseThresholdConfig(["42", ">", "not-a-number"])).toBeNull();
  });

  it("evaluates each operator", () => {
    expect(evaluateThreshold(5, ">", 0)).toBe(true);
    expect(evaluateThreshold(0, ">", 0)).toBe(false);
    expect(evaluateThreshold(0, ">=", 0)).toBe(true);
    expect(evaluateThreshold(-1, "<", 0)).toBe(true);
    expect(evaluateThreshold(0, "<=", 0)).toBe(true);
    expect(evaluateThreshold(5, "=", 5)).toBe(true);
    expect(evaluateThreshold(5, "!=", 4)).toBe(true);
  });

  it("coerces values", () => {
    expect(coerceNumeric("5")).toBe(5);
    expect(coerceNumeric("  3.14  ")).toBe(3.14);
    expect(coerceNumeric(7)).toBe(7);
    expect(coerceNumeric(null)).toBeNull();
    expect(coerceNumeric("")).toBeNull();
    expect(coerceNumeric("abc")).toBeNull();
    expect(coerceNumeric(NaN)).toBeNull();
  });

  it("guards operator type", () => {
    expect(isThresholdOperator(">")).toBe(true);
    expect(isThresholdOperator("nope")).toBe(false);
  });
});

describe("formula evaluator", () => {
  const noFields = () => null;

  it("evaluates basic arithmetic", () => {
    expect(evaluateFormula("1 + 2 * 3", noFields)).toEqual({ ok: true, value: 7 });
    expect(evaluateFormula("(1 + 2) * 3", noFields)).toEqual({ ok: true, value: 9 });
    expect(evaluateFormula("10 / 4", noFields)).toEqual({ ok: true, value: 2.5 });
    expect(evaluateFormula("10 % 3", noFields)).toEqual({ ok: true, value: 1 });
    expect(evaluateFormula("-5 + 3", noFields)).toEqual({ ok: true, value: -2 });
  });

  it("evaluates comparisons returning boolean", () => {
    expect(evaluateFormula("5 > 0", noFields)).toEqual({ ok: true, value: true });
    expect(evaluateFormula("5 = 5", noFields)).toEqual({ ok: true, value: true });
    expect(evaluateFormula("5 == 5", noFields)).toEqual({ ok: true, value: true });
    expect(evaluateFormula("5 != 4", noFields)).toEqual({ ok: true, value: true });
    expect(evaluateFormula("5 <= 5", noFields)).toEqual({ ok: true, value: true });
  });

  it("evaluates logical operators", () => {
    expect(evaluateFormula("true && false", noFields)).toEqual({ ok: true, value: false });
    expect(evaluateFormula("true || false", noFields)).toEqual({ ok: true, value: true });
    expect(evaluateFormula("!false", noFields)).toEqual({ ok: true, value: true });
    expect(evaluateFormula("(1 > 0) && (2 < 5)", noFields)).toEqual({ ok: true, value: true });
  });

  it("resolves field references", () => {
    const values: Record<string, unknown> = { "12": "100", "13": 50, "14": "abc" };
    const resolve = (ref: string) => values[ref];
    expect(evaluateFormula("{12} - {13}", resolve)).toEqual({ ok: true, value: 50 });
    expect(evaluateFormula("{12} > {13}", resolve)).toEqual({ ok: true, value: true });
    // non-numeric and missing fields collapse to 0
    expect(evaluateFormula("{14} + {99}", resolve)).toEqual({ ok: true, value: 0 });
  });

  it("returns an error for invalid syntax", () => {
    const r1 = evaluateFormula("1 +", noFields);
    expect(r1.ok).toBe(false);
    const r2 = evaluateFormula("(1 + 2", noFields);
    expect(r2.ok).toBe(false);
    const r3 = evaluateFormula("foo + 1", noFields);
    expect(r3.ok).toBe(false);
    const r4 = evaluateFormula("", noFields);
    expect(r4.ok).toBe(false);
  });

  it("flags non-finite results", () => {
    const r = evaluateFormula("1 / 0", noFields);
    expect(r.ok).toBe(false);
  });

  it("rejects unbalanced field refs", () => {
    const r = evaluateFormula("{12 + 1", noFields);
    expect(r.ok).toBe(false);
  });

  it("never invokes eval or Function", () => {
    // `constructor` would let an attacker break out via JS reflection; ensure
    // the tokenizer rejects bare identifiers other than true/false.
    const r = evaluateFormula("constructor", noFields);
    expect(r.ok).toBe(false);
  });

  it("extracts field references", () => {
    expect(extractFormulaReferences("{12} + {13} - {12}")).toEqual(["12", "13"]);
    expect(extractFormulaReferences("no refs here")).toEqual([]);
    expect(extractFormulaReferences("")).toEqual([]);
  });

  it("returns extracted refs that an admin save check can validate", () => {
    // The admin UI rejects non-numeric or unknown refs at save time. Confirm
    // the helper surfaces them so that check can find them.
    expect(extractFormulaReferences("{benefit} + {12}")).toEqual(["benefit", "12"]);
    expect(extractFormulaReferences("{12x} - 1")).toEqual(["12x"]);
  });
});
