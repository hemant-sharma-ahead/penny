// Pure N-party split engine (Phase 1.5 Track E, E3). No crypto, no DB, no worker — just the math, so
// it unit-tests directly and can be reused by the shared-expense composer and the group dashboard.
//
// Money is handled in integer paise internally to avoid floating-point drift; every split reconciles
// EXACTLY to the total (any rounding remainder is distributed deterministically), so the shared ledger
// never leaks or invents a paisa. Generalises the pairwise IOU math (`core/iou/ledger.ts`) to N members.

export type SplitMethod = 'equal' | 'unequal' | 'percent' | 'shares';

export interface ComputeSharesInput {
  /** Total amount in rupees. */
  total: number;
  method: SplitMethod;
  /** Member ids participating in the split. */
  participants: string[];
  /**
   * Per-participant values, meaning depends on `method`:
   *  - `unequal`: exact rupee amounts
   *  - `percent`: percentages (should sum to 100)
   *  - `shares`: share counts (any positive numbers)
   * Ignored for `equal`.
   */
  values?: Record<string, number>;
}

export interface ComputeSharesResult {
  /** Per-participant amount in rupees; always sums to `total` (to the paisa). */
  shares: Record<string, number>;
  /** Whether the input reconciles on its own (percentages sum to 100, unequal sums to total, …). */
  valid: boolean;
  reason?: string;
}

const toPaise = (rupees: number): number => Math.round(rupees * 100);
const toRupees = (paise: number): number => paise / 100;

/**
 * Distribute `totalPaise` across `keys` proportionally to `weights` using the largest-remainder method,
 * so the parts sum to exactly `totalPaise`. When all weights are 0, falls back to an equal split.
 */
function apportion(totalPaise: number, keys: string[], weights: number[]): Record<string, number> {
  const sumW = weights.reduce((s, w) => s + w, 0);
  const n = keys.length;
  const out: Record<string, number> = {};
  if (n === 0) return out;
  if (sumW <= 0) {
    // Equal split with remainder handed to the first members.
    const base = Math.floor(totalPaise / n);
    const rem = totalPaise - base * n;
    keys.forEach((k, i) => (out[k] = base + (i < rem ? 1 : 0)));
    return out;
  }
  // Floor each allocation, track fractional remainders, then hand the leftover paise to the largest
  // fractions (deterministic tie-break by original order).
  const raw = keys.map((k, i) => {
    const exact = (totalPaise * (weights[i] ?? 0)) / sumW;
    const floor = Math.floor(exact);
    return { k, floor, frac: exact - floor, i };
  });
  const allocated = raw.reduce((s, r) => s + r.floor, 0);
  const leftover = totalPaise - allocated;
  const order = [...raw].sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const r of raw) out[r.k] = r.floor;
  for (let j = 0; j < leftover; j++) {
    const target = order[j % order.length];
    if (target) out[target.k] = (out[target.k] ?? 0) + 1;
  }
  return out;
}

/**
 * Compute each participant's share for a shared expense. Always returns amounts that sum exactly to the
 * total; `valid` reports whether the raw input reconciled (so the composer can gate "Save").
 */
export function computeShares(input: ComputeSharesInput): ComputeSharesResult {
  const { method, participants } = input;
  const totalPaise = toPaise(input.total);
  const values = input.values ?? {};

  if (participants.length === 0) {
    return { shares: {}, valid: false, reason: 'No participants' };
  }
  if (totalPaise <= 0) {
    return {
      shares: Object.fromEntries(participants.map((p) => [p, 0])),
      valid: false,
      reason: 'Total must be positive'
    };
  }

  if (method === 'equal') {
    const paise = apportion(
      totalPaise,
      participants,
      participants.map(() => 1)
    );
    return { shares: mapRupees(paise), valid: true };
  }

  if (method === 'unequal') {
    const sumPaise = participants.reduce((s, p) => s + toPaise(values[p] ?? 0), 0);
    const shares = Object.fromEntries(participants.map((p) => [p, values[p] ?? 0]));
    const valid = sumPaise === totalPaise;
    return { shares, valid, ...(valid ? {} : { reason: 'Amounts must add up to the total' }) };
  }

  if (method === 'percent') {
    const pctSum = participants.reduce((s, p) => s + (values[p] ?? 0), 0);
    const paise = apportion(
      totalPaise,
      participants,
      participants.map((p) => values[p] ?? 0)
    );
    const valid = Math.abs(pctSum - 100) < 0.01;
    return { shares: mapRupees(paise), valid, ...(valid ? {} : { reason: 'Percentages must add up to 100%' }) };
  }

  // shares
  const shareSum = participants.reduce((s, p) => s + (values[p] ?? 0), 0);
  const paise = apportion(
    totalPaise,
    participants,
    participants.map((p) => values[p] ?? 0)
  );
  const valid = shareSum > 0;
  return { shares: mapRupees(paise), valid, ...(valid ? {} : { reason: 'Enter at least one share' }) };
}

function mapRupees(paise: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(paise).map(([k, v]) => [k, toRupees(v)]));
}

/** Convenience: an equal split among participants. */
export function equalSplit(total: number, participants: string[]): Record<string, number> {
  return computeShares({ total, method: 'equal', participants }).shares;
}

// ─── Event folding → per-member net balances ──────────────────────────────────

export interface SharedExpensePayload {
  /** Stable logical id of the expense (edits/deletes reference it). */
  expenseId: string;
  amount: number;
  /** Member id who paid. */
  payer: string;
  /** Per-participant owed amounts (from computeShares). */
  shares: Record<string, number>;
}

export type SettlementKind = 'repayment' | 'write_off';

export interface SettlementPayload {
  from: string; // who paid the settlement
  to: string; // who received it
  amount: number;
  /** Stable logical id of this settlement (an {@link FoldEvent} of type `settlement_void` references
   *  it to reverse it). Optional for backward compatibility — older events without one simply can't
   *  be voided (real-device-testing-pass.md Phase 3, item 17). */
  id?: string;
  /** `repayment` (default when absent, for backward compatibility) = real money moved.
   *  `write_off` = a "never coming back" resolution — no money moved, distinct display everywhere,
   *  and reversible via a `settlement_void` event referencing this settlement's `id`. */
  kind?: SettlementKind;
}

export type FoldEvent =
  | { type: 'shared_expense'; payload: SharedExpensePayload }
  | { type: 'expense_edit'; payload: SharedExpensePayload }
  | { type: 'expense_delete'; expenseId: string }
  | { type: 'settlement'; payload: SettlementPayload }
  | { type: 'settlement_void'; settlementId: string };

/**
 * Fold an ordered event stream into a net balance per member (in rupees). Positive = the member is owed
 * money overall; negative = they owe. Edits supersede the referenced expense; deletes tombstone it.
 * A voided settlement (by `id`) is excluded entirely, so "undo write-off" restores the balance to
 * exactly what it was before that settlement — reversible, not just re-labeled.
 * The sum of all balances is always ~0 (money is conserved).
 */
export function foldGroupBalances(events: FoldEvent[]): Record<string, number> {
  // Resolve the effective (latest, non-deleted) expense per logical id, preserving stream order.
  const expenses = new Map<string, SharedExpensePayload>();
  const deleted = new Set<string>();
  const settlements: SettlementPayload[] = [];
  const voidedSettlementIds = new Set<string>();

  for (const e of events) {
    if (e.type === 'shared_expense' || e.type === 'expense_edit') {
      expenses.set(e.payload.expenseId, e.payload);
    } else if (e.type === 'expense_delete') {
      deleted.add(e.expenseId);
    } else if (e.type === 'settlement_void') {
      voidedSettlementIds.add(e.settlementId);
    } else {
      settlements.push(e.payload);
    }
  }

  const paise = new Map<string, number>();
  const add = (member: string, amountPaise: number) => paise.set(member, (paise.get(member) ?? 0) + amountPaise);

  for (const [id, exp] of expenses) {
    if (deleted.has(id)) continue;
    add(exp.payer, toPaise(exp.amount)); // the payer fronted the whole amount
    for (const [member, share] of Object.entries(exp.shares)) add(member, -toPaise(share)); // each owes their share
  }

  // A settlement moves money: the payer's debt shrinks (+), the receiver's credit shrinks (−). A
  // voided one (undone write-off) never happened, so it's skipped entirely.
  for (const s of settlements) {
    if (s.id && voidedSettlementIds.has(s.id)) continue;
    add(s.from, toPaise(s.amount));
    add(s.to, -toPaise(s.amount));
  }

  const out: Record<string, number> = {};
  for (const [member, p] of paise) out[member] = toRupees(p);
  return out;
}

// ─── Minimal settle-up transfers ───────────────────────────────────────────────

export interface Transfer {
  from: string; // debtor
  to: string; // creditor
  amount: number; // rupees
}

/**
 * Given net balances, produce a minimal-ish set of pairwise transfers that settles everyone (greedy
 * largest-debtor ↔ largest-creditor matching — the "simplify debts" heuristic). Sub-paisa residue is
 * ignored. Returns an empty list when everyone is already settled.
 */
export function whoOwesWhom(balances: Record<string, number>): Transfer[] {
  const creditors: Array<{ id: string; amt: number }> = [];
  const debtors: Array<{ id: string; amt: number }> = [];
  for (const [id, bal] of Object.entries(balances)) {
    const p = toPaise(bal);
    if (p > 0) creditors.push({ id, amt: p });
    else if (p < 0) debtors.push({ id, amt: -p });
  }
  // Largest first for a stable, compact result.
  creditors.sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    if (!c || !d) break;
    const pay = Math.min(c.amt, d.amt);
    if (pay > 0) transfers.push({ from: d.id, to: c.id, amount: toRupees(pay) });
    c.amt -= pay;
    d.amt -= pay;
    if (c.amt === 0) ci++;
    if (d.amt === 0) di++;
  }
  return transfers;
}
