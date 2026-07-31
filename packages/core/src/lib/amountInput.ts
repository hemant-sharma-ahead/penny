// Pure parsing/formatting logic for the AmountInput component — extracted here (rather than left
// duplicated inside apps/web-react's AmountInput.tsx) during the mobile migration's Track 3 UI port,
// since it's plain string/number math with zero DOM dependency and both platforms' AmountInput need
// byte-identical behavior. `caretAfter` (DOM caret-position math) stays web-only — RN's TextInput
// doesn't expose the same live selection-restoration hook, so apps/mobile's port skips it (a minor,
// accepted UX simplification: the cursor doesn't get precisely re-positioned after a re-format).

/** Characters permitted while typing — digits, decimal, and calculator operators. */
const ALLOWED = /[^0-9.+\-*/]/g;
const HAS_OPERATOR = /[+\-*/]/;

/** Strips grouping commas and any other disallowed characters. */
export function sanitize(s: string): string {
  return s.replace(ALLOWED, '');
}

/** Indian-grouped display of a plain numeric string, preserving any decimal part. */
export function groupForDisplay(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const [intPart = '', decPart] = raw.replace('-', '').split('.');
  if (!intPart && decPart === undefined) return '';
  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart || '0';
  } else {
    const tail = intPart.slice(-3);
    const head = intPart.slice(0, -3);
    const groups: string[] = [];
    for (let i = head.length; i > 0; i -= 2) {
      groups.unshift(head.slice(Math.max(0, i - 2), i));
    }
    grouped = [...groups, tail].join(',');
  }
  return `${negative ? '-' : ''}${grouped}${decPart !== undefined ? `.${decPart}` : ''}`;
}

/** What to show in the field: group plain numbers, leave calculator expressions raw. */
export function formatField(sanitized: string): string {
  return HAS_OPERATOR.test(sanitized) ? sanitized : groupForDisplay(sanitized);
}

export function isExpression(text: string): boolean {
  return HAS_OPERATOR.test(text);
}

/**
 * Evaluates a simple arithmetic expression (+ − × ÷, left-to-right with ×÷ precedence). Returns null
 * for empty/invalid input. No `eval` — tokenised and folded by hand so it's safe on untrusted strings.
 */
export function evaluate(expr: string): number | null {
  const tokens = expr.match(/(\d*\.?\d+|[+\-*/])/g);
  if (!tokens || tokens.length === 0) return null;

  const nums: number[] = [];
  const ops: string[] = [];
  let expectNumber = true;
  for (const t of tokens) {
    if (HAS_OPERATOR.test(t) && t.length === 1) {
      if (expectNumber) return null; // operator where a number was expected
      ops.push(t);
      expectNumber = true;
    } else {
      const n = parseFloat(t);
      if (!Number.isFinite(n)) return null;
      nums.push(n);
      expectNumber = false;
    }
  }
  if (expectNumber) return null; // trailing operator → incomplete

  // Pass 1: × and ÷
  for (let i = 0; i < ops.length;) {
    const op = ops[i];
    if (op === '*' || op === '/') {
      const a = nums[i];
      const b = nums[i + 1];
      if (a === undefined || b === undefined) return null;
      const r = op === '*' ? a * b : b === 0 ? NaN : a / b;
      if (!Number.isFinite(r)) return null;
      nums.splice(i, 2, r);
      ops.splice(i, 1);
    } else {
      i++;
    }
  }
  // Pass 2: + and −
  let acc = nums[0];
  if (acc === undefined) return null;
  for (let i = 0; i < ops.length; i++) {
    const b = nums[i + 1];
    if (b === undefined) return null;
    acc = ops[i] === '+' ? acc + b : acc - b;
  }
  return Number.isFinite(acc) ? acc : null;
}

/** Best-effort numeric value of a draft, tolerating a trailing operator. */
export function resolve(draft: string): number | null {
  const direct = evaluate(draft);
  if (direct !== null) return direct;
  const trimmed = draft.replace(/[+\-*/.]+$/, '');
  return trimmed ? evaluate(trimmed) : null;
}
