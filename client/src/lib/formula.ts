// Safe arithmetic formula evaluator for custom-field formulas.
// Supports: numeric literals, + - * / %, parentheses, and named field
// references written as `{Field Name}`. The named references are resolved via
// the `lookup` callback (case-insensitive, trim-whitespace match).
//
// This is a small Pratt-style parser — we explicitly avoid eval/Function so
// user-authored formulas can never execute arbitrary JavaScript.

export type FormulaLookup = (name: string, visited: Set<string>) => number | undefined;

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "%" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "ref"; name: string };

export function extractFormulaRefs(formula: string): string[] {
  const refs = new Set<string>();
  const re = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) refs.add(m[1].trim());
  return Array.from(refs);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
      tokens.push({ type: "op", value: ch }); i++; continue;
    }
    if (ch === "{") {
      const end = input.indexOf("}", i + 1);
      if (end === -1) throw new Error("Unclosed field reference");
      tokens.push({ type: "ref", name: input.slice(i + 1, end).trim() });
      i = end + 1; continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let j = i + 1;
      while (j < input.length && ((input[j] >= "0" && input[j] <= "9") || input[j] === ".")) j++;
      const n = Number(input.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`Invalid number: ${input.slice(i, j)}`);
      tokens.push({ type: "num", value: n });
      i = j; continue;
    }
    throw new Error(`Unexpected character "${ch}"`);
  }
  return tokens;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };

// Convert to RPN via shunting-yard (handles unary minus by treating leading/post-op `-` as `0 -`).
function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  let prev: Token | undefined;
  for (const tk of tokens) {
    let t = tk;
    if (t.type === "op" && (t.value === "-" || t.value === "+")) {
      const isUnary = !prev || prev.type === "op" || prev.type === "lparen";
      if (isUnary) {
        out.push({ type: "num", value: 0 });
      }
    }
    if (t.type === "num" || t.type === "ref") {
      out.push(t);
    } else if (t.type === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type === "op" && PREC[top.value] >= PREC[t.value]) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(t);
    } else if (t.type === "lparen") {
      ops.push(t);
    } else if (t.type === "rparen") {
      while (ops.length && ops[ops.length - 1].type !== "lparen") out.push(ops.pop()!);
      if (!ops.length) throw new Error("Mismatched parenthesis");
      ops.pop();
    }
    prev = t;
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op.type === "lparen") throw new Error("Mismatched parenthesis");
    out.push(op);
  }
  return out;
}

function evalRpn(rpn: Token[], lookup: FormulaLookup, visited: Set<string>): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === "num") stack.push(t.value);
    else if (t.type === "ref") {
      const v = lookup(t.name, visited);
      if (v === undefined || v === null || Number.isNaN(v)) throw new Error(`Missing value for {${t.name}}`);
      stack.push(v);
    } else if (t.type === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Malformed expression");
      switch (t.value) {
        case "+": stack.push(a + b); break;
        case "-": stack.push(a - b); break;
        case "*": stack.push(a * b); break;
        case "/": stack.push(b === 0 ? NaN : a / b); break;
        case "%": stack.push(b === 0 ? NaN : a % b); break;
      }
    }
  }
  if (stack.length !== 1) throw new Error("Malformed expression");
  return stack[0];
}

export function evaluateFormula(
  formula: string,
  lookup: FormulaLookup,
  visited: Set<string> = new Set()
): { ok: true; value: number } | { ok: false; error: string } {
  try {
    const tokens = tokenize(formula);
    if (!tokens.length) return { ok: false, error: "Empty formula" };
    const rpn = toRpn(tokens);
    const value = evalRpn(rpn, lookup, visited);
    if (!Number.isFinite(value)) return { ok: false, error: "Result is not a finite number" };
    return { ok: true, value };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Invalid formula" };
  }
}
