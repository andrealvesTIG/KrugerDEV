/**
 * Safe formula evaluator for the `formula` computed custom field type.
 *
 * Admins write an expression like:
 *   {12} + {13} - 100
 *   ({budget} - {actual}) / {budget} * 100
 *   {benefit} > {cost}
 *
 * Field references are tokens of the form `{<customFieldId>}` (or, less
 * commonly, `{<fieldKey>}` — anything inside the braces). The caller passes
 * a resolver that turns the raw token into the value to substitute.
 *
 * Supported:
 *   - Numeric literals (integer / decimal, optional leading minus via unary)
 *   - Boolean literals: true / false
 *   - Arithmetic: + - * / %  and parentheses
 *   - Comparisons: == != < <= > >=
 *   - Logical: && || ! (work on truthy values)
 *   - Unary minus and unary plus
 *
 * Storage shape on `customFieldDefinitions.options` (text[]):
 *   [expression]
 *
 * SAFETY: this is a hand-written recursive-descent parser. It NEVER calls
 * `eval`, `Function`, or any host function. The grammar is closed: only the
 * operators listed above and field-reference tokens are accepted.
 */

export type FormulaValue = number | boolean;

export type FormulaResolver = (ref: string) => unknown;

export type FormulaResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: string };

type Token =
  | { kind: "num"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "ref"; ref: string };

const MULTICHAR_OPS = ["==", "!=", "<=", ">=", "&&", "||"];
const SINGLECHAR_OPS = new Set(["+", "-", "*", "/", "%", "<", ">", "!"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "(") { tokens.push({ kind: "lparen" }); i++; continue; }
    if (c === ")") { tokens.push({ kind: "rparen" }); i++; continue; }
    if (c === "{") {
      const end = input.indexOf("}", i + 1);
      if (end < 0) throw new Error(`Unclosed field reference starting at position ${i}`);
      const ref = input.slice(i + 1, end).trim();
      if (!ref) throw new Error(`Empty field reference at position ${i}`);
      tokens.push({ kind: "ref", ref });
      i = end + 1;
      continue;
    }
    // Number literal: digit or leading dot.
    if ((c >= "0" && c <= "9") || (c === "." && input[i + 1] >= "0" && input[i + 1] <= "9")) {
      let j = i;
      let sawDot = false;
      while (j < input.length) {
        const ch = input[j];
        if (ch >= "0" && ch <= "9") { j++; continue; }
        if (ch === "." && !sawDot) { sawDot = true; j++; continue; }
        break;
      }
      const n = parseFloat(input.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`Invalid number near position ${i}`);
      tokens.push({ kind: "num", value: n });
      i = j;
      continue;
    }
    // Identifier: true / false only. No other identifiers are allowed.
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      let j = i;
      while (j < input.length) {
        const ch = input[j];
        if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_") {
          j++;
        } else break;
      }
      const ident = input.slice(i, j).toLowerCase();
      if (ident === "true") tokens.push({ kind: "bool", value: true });
      else if (ident === "false") tokens.push({ kind: "bool", value: false });
      else throw new Error(`Unknown identifier "${input.slice(i, j)}" — use {fieldId} to reference a field`);
      i = j;
      continue;
    }
    // Operators (multi-char first).
    const two = input.slice(i, i + 2);
    if (MULTICHAR_OPS.includes(two)) { tokens.push({ kind: "op", value: two }); i += 2; continue; }
    if (c === "=" && input[i + 1] !== "=") {
      // Allow a bare `=` as comparison shorthand for `==` so admins can write
      // human-friendly formulas like `{a} = 0`. This matches the operator
      // choices we offer for threshold_check.
      tokens.push({ kind: "op", value: "==" }); i++; continue;
    }
    if (SINGLECHAR_OPS.has(c)) { tokens.push({ kind: "op", value: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

// Operator precedence (higher = tighter binding). Mirrors a reasonable subset
// of JS precedence so the rules are intuitive for admins.
const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3, "!=": 3,
  "<": 4, "<=": 4, ">": 4, ">=": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
  // Unary (handled specially): 7
};

/**
 * Recursive-descent (Pratt-style) parser & evaluator.
 */
function evalTokens(tokens: Token[], resolve: FormulaResolver): FormulaValue {
  let pos = 0;
  const peek = () => tokens[pos];

  const resolveRef = (ref: string): FormulaValue => {
    const raw = resolve(ref);
    if (raw == null) return 0;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
    if (typeof raw === "boolean") return raw;
    const s = String(raw).trim();
    if (!s) return 0;
    if (s.toLowerCase() === "true") return true;
    if (s.toLowerCase() === "false") return false;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const parsePrimary = (): FormulaValue => {
    const t = peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.kind === "num") { pos++; return t.value; }
    if (t.kind === "bool") { pos++; return t.value; }
    if (t.kind === "ref") { pos++; return resolveRef(t.ref); }
    if (t.kind === "lparen") {
      pos++;
      const v = parseExpr(0);
      const next = peek();
      if (!next || next.kind !== "rparen") throw new Error("Missing closing parenthesis");
      pos++;
      return v;
    }
    if (t.kind === "op" && (t.value === "+" || t.value === "-" || t.value === "!")) {
      pos++;
      const inner = parsePrimary();
      if (t.value === "+") return toNumber(inner);
      if (t.value === "-") return -toNumber(inner);
      return !toBool(inner);
    }
    throw new Error(`Unexpected token "${describeToken(t)}"`);
  };

  const parseExpr = (minPrec: number): FormulaValue => {
    let left = parsePrimary();
    while (true) {
      const t = peek();
      if (!t || t.kind !== "op") break;
      const prec = PREC[t.value];
      if (prec == null || prec < minPrec) break;
      pos++;
      const right = parseExpr(prec + 1);
      left = applyBinary(t.value, left, right);
    }
    return left;
  };

  const result = parseExpr(0);
  if (pos < tokens.length) throw new Error(`Unexpected token "${describeToken(tokens[pos])}" after expression`);
  return result;
}

function toNumber(v: FormulaValue): number {
  if (typeof v === "number") return v;
  return v ? 1 : 0;
}
function toBool(v: FormulaValue): boolean {
  if (typeof v === "boolean") return v;
  return v !== 0 && Number.isFinite(v);
}

function applyBinary(op: string, l: FormulaValue, r: FormulaValue): FormulaValue {
  switch (op) {
    case "+": return toNumber(l) + toNumber(r);
    case "-": return toNumber(l) - toNumber(r);
    case "*": return toNumber(l) * toNumber(r);
    case "/": {
      const rn = toNumber(r);
      if (rn === 0) return NaN;
      return toNumber(l) / rn;
    }
    case "%": {
      const rn = toNumber(r);
      if (rn === 0) return NaN;
      return toNumber(l) % rn;
    }
    case "==": return toNumber(l) === toNumber(r);
    case "!=": return toNumber(l) !== toNumber(r);
    case "<": return toNumber(l) < toNumber(r);
    case "<=": return toNumber(l) <= toNumber(r);
    case ">": return toNumber(l) > toNumber(r);
    case ">=": return toNumber(l) >= toNumber(r);
    case "&&": return toBool(l) && toBool(r);
    case "||": return toBool(l) || toBool(r);
  }
  throw new Error(`Unsupported operator "${op}"`);
}

function describeToken(t: Token): string {
  if (t.kind === "num") return String(t.value);
  if (t.kind === "bool") return String(t.value);
  if (t.kind === "ref") return `{${t.ref}}`;
  if (t.kind === "lparen") return "(";
  if (t.kind === "rparen") return ")";
  return t.value;
}

/**
 * Public entry point. Never throws — returns a discriminated result so the
 * caller can surface the error message in the UI.
 */
export function evaluateFormula(
  expression: string,
  resolve: FormulaResolver,
): FormulaResult {
  if (!expression || !expression.trim()) {
    return { ok: false, error: "Formula is empty" };
  }
  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) return { ok: false, error: "Formula is empty" };
    const value = evalTokens(tokens, resolve);
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { ok: false, error: "Result is not a finite number (division by zero?)" };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Extract field-reference tokens from an expression. Used by the admin UI to
 * show "referenced fields" and warn about unknown ids.
 */
export function extractFormulaReferences(expression: string): string[] {
  if (!expression) return [];
  const refs = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expression)) !== null) {
    const r = m[1].trim();
    if (r) refs.add(r);
  }
  return Array.from(refs);
}
