import { describe, it, expect } from 'vitest';
import {
  decimalString,
  strictDecimalString,
  sumDecimals,
  decimalEquals,
  isZeroDecimal,
  BigNumber,
} from '@shared/lib/decimalString';

describe('decimalString Zod schema', () => {
  it('accepts canonical decimal strings', () => {
    expect(decimalString.parse('0')).toBe('0');
    expect(decimalString.parse('1234.56')).toBe('1234.56');
    expect(decimalString.parse('-100')).toBe('-100');
    expect(decimalString.parse('0.10')).toBe('0.1');
  });

  it('REJECTS JS number inputs — the whole point of the boundary', () => {
    // The original bug: JS Number (a float) bled into money math and dropped
    // precision. Numbers are rejected at the schema layer so this can't
    // happen via the API.
    expect(() => decimalString.parse(1234.56 as any)).toThrow();
    expect(() => decimalString.parse(0 as any)).toThrow();
    expect(() => decimalString.parse(0.1 as any)).toThrow();
  });

  it('rejects NaN / Infinity / non-numeric / empty', () => {
    expect(() => decimalString.parse('not-a-number')).toThrow();
    expect(() => decimalString.parse('')).toThrow();
    expect(() => decimalString.parse('NaN')).toThrow();
    expect(() => decimalString.parse('Infinity')).toThrow();
  });

  it('rejects more than 4 decimal places', () => {
    expect(() => decimalString.parse('0.12345')).toThrow();
    expect(decimalString.parse('0.1234')).toBe('0.1234');
  });

  it('strictDecimalString rejects raw numbers at the type level', () => {
    // Strict variant is `z.string()` so passing a number fails parsing.
    expect(() => strictDecimalString.parse(1.5 as any)).toThrow();
    expect(strictDecimalString.parse('1.50')).toBe('1.5');
  });
});

describe('sumDecimals — precision round-trip', () => {
  // The whole reason the financial layer moved off `+` arithmetic on JS
  // numbers: 0.1 + 0.1 + ... + 0.1 (10×) was 0.9999999999999999, which
  // tripped the change-order summary rollup and made the contract total
  // disagree with the sum of its line items by a fraction of a cent.
  it('adding 0.10 ten times equals 1 exactly (the canonical float-drift case)', () => {
    expect(sumDecimals(Array.from({ length: 10 }, () => '0.10'))).toBe('1');
  });

  it('large mixed-sign sums stay exact', () => {
    expect(sumDecimals(['1000000.01', '-1000000.01'])).toBe('0');
    expect(sumDecimals(['123.45', '0', null, undefined, '-23.45'])).toBe('100');
  });

  it('reproduces the change-order summary path (10 × 0.10 cost impacts)', () => {
    // Mirrors the BigNumber rollup in changeOrderRoutes.ts /summary.
    const costImpacts = Array.from({ length: 10 }, () => '0.10');
    const total = sumDecimals(costImpacts);
    expect(new BigNumber(total).toFixed(2)).toBe('1.00');
    expect(decimalEquals(total, '1.00')).toBe(true);
    expect(decimalEquals(total, '1')).toBe(true);
  });

  it('isZeroDecimal handles null/undefined/empty/zero/non-zero', () => {
    expect(isZeroDecimal(null)).toBe(true);
    expect(isZeroDecimal(undefined)).toBe(true);
    expect(isZeroDecimal('')).toBe(true);
    expect(isZeroDecimal('0')).toBe(true);
    expect(isZeroDecimal('0.00')).toBe(true);
    expect(isZeroDecimal('0.01')).toBe(false);
    expect(isZeroDecimal(0)).toBe(true);
  });
});
