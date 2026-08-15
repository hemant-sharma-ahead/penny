// Conservative transfer-pair detector for the import review screen (packages/core/src/core/import/).
// A real export sometimes contains a cash withdrawal / self-transfer as TWO rows — one outgoing from
// account A, one incoming to account B — that are really a single movement of the user's own money,
// not two separate transactions. Counting both inflates "actual transactions" and can double-count
// spend. This only pairs two rows when confident:
//   - same absolute amount, within a paisa (see AMOUNT_EPSILON below — a real Cashew export was found
//     2026-07-29 to write the "incoming" side of a transfer as e.g. 139999.99999999997 instead of a
//     clean 140000.0, a binary floating-point artifact in Cashew's own export, not our parser — so an
//     exact `===` comparison silently missed every real transfer pair in that file)
//   - opposite expense/income direction
//   - two DIFFERENT accounts (both rows must carry an account — no account means no pairing)
//   - dates within 3 days of each other (widened from 1 day, 2026-07-xx: a real MoneyView export was
//     found to have a confirmed transfer — ₹7,500, HDFC-x1234 debit on 2022/Oct/09, cash credit on
//     2022/Oct/11 — 2 days apart, which real-world data-entry lag makes common; 1 day was too strict)
//   - AND at least one of two independent "this really is one transfer" signals:
//       (1) at least one side's source category name looks like inter-account bookkeeping
//           (see isLikelyTransfer — "Balance Correction", "Cash Forward", etc.), or
//       (2) both sides share the identical title/description AND identical note text — a real Cashew
//           export was found 2026-07-29 to write BOTH sides of a genuine transfer with the exact same
//           title ("Cash withdrawal for papaji") and note ("Transferred Balance\nHDFC XX8112 → Cash"),
//           which is a stronger, export-agnostic signal than any fixed category-keyword list (it still
//           works for a format whose category names don't match TRANSFER_KEYWORDS at all)
// A wrong pairing would misrepresent the user's data, so this deliberately does NOT pair on category
// match alone, across more than a 1-day gap, or when either row lacks an account. Rows that don't
// confidently pair just render normally as two separate transactions — this is a nice-to-have
// simplification of the preview, never a hard requirement.
import type { ParsedRow } from './importParsers';
import { isLikelyTransfer } from './importCategoryResolution';

export interface TransferPair {
  /** Index into the original rows array of the outgoing (expense-type) row. */
  outgoingIndex: number;
  /** Index into the original rows array of the incoming (income-type) row. */
  incomingIndex: number;
  fromAccount: string;
  toAccount: string;
  amount: number;
  /** The outgoing row's date, used as the pair's representative date. */
  date: number;
}

/** Stable identity for a detected pair, used to track a user's explicit "not a transfer — log
 *  separately" un-pair action (see `useImport.ts`'s `unpairedTransferKeys`) across re-renders —
 *  `detectTransferPairs` recomputes fresh every time, so the pair itself is never a stable
 *  reference, but the (outgoingIndex, incomingIndex) tuple is (both indices are stable for a
 *  session — see `parsedRows`' append-only doc comment elsewhere). */
export function transferPairKey(outgoingIndex: number, incomingIndex: number): string {
  return `${outgoingIndex}-${incomingIndex}`;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATE_TOLERANCE_MS = 3 * ONE_DAY_MS;
/** Amounts within 1 paisa of each other count as "the same" — real-world exports can carry binary
 *  floating-point noise several orders of magnitude smaller than this (see file header comment). */
const AMOUNT_EPSILON = 0.01;

/** True when both rows carry the identical (trimmed, case-insensitive) title AND identical non-empty
 *  note text — see file header comment, signal (2). */
function sameNarrative(a: ParsedRow, b: ParsedRow): boolean {
  const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();
  const note = norm(a.notes);
  if (!note) return false;
  return norm(a.description) === norm(b.description) && note === norm(b.notes);
}

/** Shared pairing loop — every gate (same amount within epsilon, opposite direction, two different
 *  accounts, date within tolerance) is identical for every caller; only the final "does this actually
 *  look like one transfer" signal varies, via `looksLikeTransfer`. Extracted 2026-08-14 so the new
 *  `detectSelfAccountMovementPairs` below (redesign doc §7.1) can reuse the exact same conservative
 *  pairing algorithm with a broader signal, without duplicating it — `detectTransferPairs`'s own
 *  behavior is unchanged (it calls this with the exact same signal it always used). */
function findPairsBySignal(
  rows: ParsedRow[],
  looksLikeTransfer: (a: ParsedRow, b: ParsedRow) => boolean
): TransferPair[] {
  const used = new Set<number>();
  const pairs: TransferPair[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (used.has(i)) continue;
    const a = rows[i];
    if (!a || !a.account) continue;
    if (a.type !== 'expense' && a.type !== 'income') continue;

    for (let j = i + 1; j < rows.length; j++) {
      if (used.has(j)) continue;
      const b = rows[j];
      if (!b || !b.account || b.account === a.account) continue;
      if (Math.abs(b.amount - a.amount) > AMOUNT_EPSILON) continue;
      if (Math.abs(b.date - a.date) > DATE_TOLERANCE_MS) continue;

      const oppositeDirection =
        (a.type === 'expense' && b.type === 'income') || (a.type === 'income' && b.type === 'expense');
      if (!oppositeDirection) continue;
      if (!looksLikeTransfer(a, b)) continue;

      const outgoingIsA = a.type === 'expense';
      const outgoing = outgoingIsA ? a : b;
      const incoming = outgoingIsA ? b : a;

      pairs.push({
        outgoingIndex: outgoingIsA ? i : j,
        incomingIndex: outgoingIsA ? j : i,
        fromAccount: outgoing.account ?? '',
        toAccount: incoming.account ?? '',
        amount: a.amount,
        date: outgoing.date
      });
      used.add(i);
      used.add(j);
      break;
    }
  }

  return pairs;
}

export function detectTransferPairs(rows: ParsedRow[]): TransferPair[] {
  return findPairsBySignal(
    rows,
    (a, b) => isLikelyTransfer(a.categoryName) || isLikelyTransfer(b.categoryName) || sameNarrative(a, b)
  );
}

// ─── Self-account-movement generalization (2026-08-14, redesign doc §7.1) ─────────────────────────────
// Re-reading the category list surfaced that wallet top-ups, cash withdrawal, and CC bill payment are
// all the same real-world shape — money moving from one of the user's own accounts into another of
// their own accounts. One general detector, not three/four bespoke heuristics, per the doc's explicit
// decision. Lives alongside `detectTransferPairs` as an extension of it (reusing `findPairsBySignal`
// above), not a parallel system — but is its OWN new function, never a modification of
// `detectTransferPairs` itself, so `apps/web-react`'s frozen direct call to that function keeps its
// exact existing behavior.

/** Keywords for a self-account movement NOT already covered by `TRANSFER_KEYWORDS`
 *  (importCategoryResolution.ts's `isLikelyTransfer`) — cash withdrawal and CC bill payment phrasing.
 *  Kept as its own list (not an addition to `TRANSFER_KEYWORDS`) for the same reason
 *  `isLikelyIouSuspect`/`isLikelyInvestmentMovement` are their own lists in importCategoryResolution.ts:
 *  `isLikelyTransfer` feeds `resolveCategories()`, which `apps/web-react` calls directly — broadening
 *  that shared list would silently change web's category-resolution suggestions too. This list only
 *  ever feeds `detectSelfAccountMovementPairs` below, used exclusively by apps/mobile's new Categories
 *  wizard stage. */
const SELF_ACCOUNT_MOVEMENT_KEYWORDS = [
  'cash withdrawal',
  'atm withdrawal',
  'cash wdl',
  'wallet recharge',
  'wallet reload',
  'wallet load',
  'add money',
  'credit card bill',
  'credit card payment',
  'cc bill',
  'cc payment',
  'card bill payment'
];

export function isLikelySelfAccountMovement(categoryName: string): boolean {
  const lower = categoryName.toLowerCase().trim();
  return SELF_ACCOUNT_MOVEMENT_KEYWORDS.some((k) => lower.includes(k));
}

/** Same conservative pairing algorithm as `detectTransferPairs` (identical amount/date-window/opposite-
 *  direction gates — see this file's header comment), but with a BROADER "does this look like one
 *  movement" signal: `isLikelyTransfer` OR `isLikelySelfAccountMovement` on either leg, OR
 *  `sameNarrative` — so a cash-withdrawal or CC-bill-payment pair auto-pairs the same way a
 *  "Balance Correction"-style row already does today. Mobile's new Categories stage calls this instead
 *  of `detectTransferPairs` for its own pairing needs; `detectTransferPairs` itself is unchanged. */
export function detectSelfAccountMovementPairs(rows: ParsedRow[]): TransferPair[] {
  return findPairsBySignal(
    rows,
    (a, b) =>
      isLikelyTransfer(a.categoryName) ||
      isLikelyTransfer(b.categoryName) ||
      isLikelySelfAccountMovement(a.categoryName) ||
      isLikelySelfAccountMovement(b.categoryName) ||
      sameNarrative(a, b)
  );
}
