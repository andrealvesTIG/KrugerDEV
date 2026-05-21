import { z } from "zod";
import BigNumber from "bignumber.js";

/**
 * Money values cross the wire as decimal strings to avoid the JS-float drift
 * (`0.1 + 0.2 !== 0.3`) that bit the financial layer. Drizzle's `numeric`
 * Postgres column also returns strings — this Zod schema is the canonical
 * boundary type for any money input on the API.
 *
 * Accepts:
 *   - string like "1234.56" / "-100" / "0" / "0.10"  (canonicalised)
 *   - number (legacy callers only; coerced via `.toString()` — NEW callers
 *     should pass strings)
 *
 * Rejects: NaN, Infinity, non-numeric strings, more than 4 decimal places.
 *
 * Returns a canonical fixed-point string (no scientific notation, no trailing
 * junk). Use `BigNumber` from `bignumber.js` for any arithmetic.
 */
export const decimalString = z
  .string({
    required_error: "money value is required",
    invalid_type_error: "money value must be a decimal STRING — JS numbers can lose precision (0.1 + 0.2 !== 0.3) and are rejected at the API boundary",
  })
  .transform((v, ctx) => {
    const raw = v.trim();
    if (raw === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "money value cannot be empty" });
      return z.NEVER;
    }
    const bn = new BigNumber(raw);
    if (!bn.isFinite()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `not a finite money value: ${raw}` });
      return z.NEVER;
    }
    // dp() returns the number of decimal places of the value. 4 dp covers
    // every currency we care about (USD/EUR are 2; some FX rates use 4).
    if ((bn.dp() ?? 0) > 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `too many decimal places (max 4): ${raw}` });
      return z.NEVER;
    }
    return bn.toFixed();
  });

/** Strict variant that rejects `number` inputs at the type and runtime level. */
export const strictDecimalString = z
  .string()
  .refine((v) => {
    const bn = new BigNumber(v.trim());
    return bn.isFinite() && (bn.dp() ?? 0) <= 4;
  }, "must be a finite decimal string with ≤4 decimal places")
  .transform((v) => new BigNumber(v.trim()).toFixed());

/** Sum a list of decimal strings exactly. Returns a canonical decimal string. */
export function sumDecimals(values: Array<string | null | undefined>): string {
  let acc = new BigNumber(0);
  for (const v of values) {
    if (v == null || v === "") continue;
    acc = acc.plus(new BigNumber(v));
  }
  return acc.toFixed();
}

/** Compare two decimal strings; returns true iff a == b numerically. */
export function decimalEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return new BigNumber(a ?? 0).isEqualTo(new BigNumber(b ?? 0));
}

/** Returns true iff a decimal string is exactly zero. Treats null/undefined/empty as zero. */
export function isZeroDecimal(v: string | number | null | undefined): boolean {
  if (v == null || v === "") return true;
  return new BigNumber(v).isZero();
}

export { BigNumber };
