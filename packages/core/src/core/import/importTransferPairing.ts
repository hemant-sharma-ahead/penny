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

export function detectTransferPairs(rows: ParsedRow[]): TransferPair[] {
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
      const looksLikeTransfer = isLikelyTransfer(a.categoryName) || isLikelyTransfer(b.categoryName);
      if (!looksLikeTransfer && !sameNarrative(a, b)) continue;

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
