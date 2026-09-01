import type { InsurancePolicy, PremiumFrequency, PremiumPayment } from '@/core/db/types';

// Premium payment mechanics — due dates, grace period, revival window (insurance-redesign-v4.html §③/
// §④/§⑥). Pure logic only; the hook layer (`useInsurance.ts`) owns persistence.
//
// Grace period (verified via WebSearch — GoDigit, Axis Max Life, Kotak Life, PayBima): Monthly pay =
// 15 days after the due date; Quarterly/Half-yearly/Annual = 30 days. Single premium has no recurring
// due date at all.
//
// Revival window (IRDAI's June 2024 Master Circular, corroborated by Ditto Insurance/OneAssure):
// non-linked (Term, Endowment, Whole Life) = 5 years from the first unpaid premium; unit-linked
// (ULIP) = 3 years.

const DAY_MS = 86_400_000;

/** Number of installments per year for a given frequency. Single premium has no recurring schedule. */
export function periodsPerYear(freq: PremiumFrequency): number {
  switch (freq) {
    case 'M':
      return 12;
    case 'Q':
      return 4;
    case 'H':
      return 2;
    case 'A':
      return 1;
    case 'S':
      return 1; // never actually divided into installments — see `installmentAmount`'s own S handling
  }
}

/** Calendar months between two occurrences of a given frequency (used to step due dates forward). */
export function intervalMonths(freq: PremiumFrequency): number {
  switch (freq) {
    case 'M':
      return 1;
    case 'Q':
      return 3;
    case 'H':
      return 6;
    case 'A':
    case 'S':
      return 12;
  }
}

/** 15 days for Monthly, 30 for everything else recurring. `null` for Single (no recurring due date). */
export function gracePeriodDays(freq: PremiumFrequency): number | null {
  if (freq === 'S') return null;
  return freq === 'M' ? 15 : 30;
}

/** 3 years for ULIP (unit-linked), 5 years for non-linked (Term, Endowment, Whole Life). */
export function revivalWindowYears(isULIP: boolean | undefined): number {
  return isULIP ? 3 : 5;
}

/** Adds `months` calendar months to an epoch-ms date, preserving day-of-month (wraps correctly across
 *  year boundaries) — same `new Date(y, m, d)` overflow trick `forecaster.ts`'s EMI stepping uses. */
export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate()).getTime();
}

/** The subset of `InsurancePolicy` the premium math actually needs — lets a caller (e.g. `PolicyForm.tsx`'s
 *  live preview) pass a lightweight in-progress "draft" object instead of a complete saved policy. */
export type PremiumMathInput = Pick<
  InsurancePolicy,
  'annualPremium' | 'paymentFrequency' | 'startDate' | 'firstYearDiscountEnabled' | 'discountType' | 'discountValue'
>;

/**
 * The exact rupee amount due for one installment at `atMs` — even division of the annual premium by
 * frequency (insurance-redesign-v4.html §⑧'s "decided as-is": real insurers' small monthly/quarterly
 * loading, ~3–5%/yr, stays a documented simplification, not modeled). Applies the first-year discount
 * only when `atMs` falls within one year of `startDate` — Year 2+ always pays the full undiscounted
 * installment. Single-premium policies pay the (possibly discounted) full annual amount once.
 */
export function installmentAmount(policy: PremiumMathInput, atMs: number): number {
  const freq = policy.paymentFrequency ?? 'A';
  const isYearOne =
    policy.firstYearDiscountEnabled === true &&
    policy.startDate !== undefined &&
    atMs < addMonths(policy.startDate, 12);

  let annual = policy.annualPremium;
  if (isYearOne && policy.discountValue) {
    annual =
      policy.discountType === 'flat'
        ? Math.max(0, policy.annualPremium - policy.discountValue)
        : policy.annualPremium * (1 - policy.discountValue / 100);
  }

  if (freq === 'S') return Math.round(annual);
  return Math.round(annual / periodsPerYear(freq));
}

/** The first "next premium due" date for a freshly-created Term/Life policy — one payment interval
 *  after `startDate` (installment 1 is paid AT the start date itself). Returns `undefined` for Single
 *  premium (no recurring schedule) or when `startDate` is unset. */
export function firstNextDueDate(policy: Pick<InsurancePolicy, 'startDate' | 'paymentFrequency'>): number | undefined {
  const freq = policy.paymentFrequency ?? 'A';
  if (freq === 'S' || policy.startDate === undefined) return undefined;
  return addMonths(policy.startDate, intervalMonths(freq));
}

/**
 * Records a "Mark as paid" tap (insurance-redesign-v4.html §④) — appends a `PremiumPayment` for the
 * policy's current `nextPremiumDueDate` and rolls that date forward by one payment-frequency interval.
 * `linkedExpenseId` is set only when the user chose to log/link a real ledger `Expense` (omitted for
 * "Skip"). Never mutates `policy` — returns the fields to merge in.
 *
 * **Limited Pay completion (fixed 2026-08-31 — a real logic gap):** a Limited Pay policy
 * (`premiumPaymentTerm === 'limited'`, e.g. "pay for 7 years, stay covered for 15") stops owing any
 * further premium once the rolled-forward due date reaches `startDate + limitedPayYears` — the LAST
 * real installment of the pay term is still recorded correctly (with its real due amount), but nothing
 * schedules after it: `nextPremiumDueDate` becomes `undefined` instead of a further future date. This is
 * the ONLY code path that ever produces an `undefined` `nextPremiumDueDate` for a policy that once had
 * one — `computeDueStatus()`'s existing `'paidUp'` branch and `scheduledOccurrencesWithin()`'s existing
 * "stop generating occurrences" check both already key off exactly that `undefined`, so this one change
 * is what actually makes both of those work for a Limited Pay policy; before this fix, `nextPremiumDueDate`
 * was unconditionally rolled forward forever, so a paid-up Limited Pay policy kept generating "Mark as
 * paid" prompts, reminders, and forecast events indefinitely past the end of its pay term.
 */
export function applyMarkAsPaid(
  policy: InsurancePolicy,
  paidMs: number,
  linkedExpenseId?: string
): {
  premiumPayments: PremiumPayment[];
  nextPremiumDueDate: number | undefined;
  nextPremiumDueDateIsCustom: false;
} {
  const freq = policy.paymentFrequency ?? 'A';
  const dueMs = policy.nextPremiumDueDate ?? paidMs;
  const amount = installmentAmount(policy, dueMs);
  const payment: PremiumPayment = {
    id: crypto.randomUUID(),
    dueMs,
    paidMs,
    amount,
    ...(linkedExpenseId ? { linkedExpenseId } : {})
  };
  const rolledForward = addMonths(dueMs, intervalMonths(freq));
  const payTermComplete =
    policy.premiumPaymentTerm === 'limited' &&
    policy.limitedPayYears !== undefined &&
    policy.startDate !== undefined &&
    rolledForward >= addMonths(policy.startDate, policy.limitedPayYears * 12);
  return {
    premiumPayments: [...(policy.premiumPayments ?? []), payment],
    nextPremiumDueDate: payTermComplete ? undefined : rolledForward,
    nextPremiumDueDateIsCustom: false
  };
}

/**
 * Reverses the MOST RECENT payment only (payment history is append-only and always shown newest-last
 * internally / newest-first in the UI — un-marking anything but the top entry would desync the rolled-
 * forward due date from what the remaining history actually supports). Returns `null` if `paymentId`
 * isn't the last entry. Rolls `nextPremiumDueDate` back to the reversed payment's own `dueMs`.
 */
export function applyUnmarkPayment(
  policy: InsurancePolicy,
  paymentId: string
): { premiumPayments: PremiumPayment[]; nextPremiumDueDate: number; removed: PremiumPayment } | null {
  const list = policy.premiumPayments ?? [];
  const last = list[list.length - 1];
  if (!last || last.id !== paymentId) return null;
  return {
    premiumPayments: list.slice(0, -1),
    nextPremiumDueDate: last.dueMs,
    removed: last
  };
}

/**
 * Every scheduled due date in `[rangeStartMs, rangeEndMsExclusive)`, starting from the policy's own
 * `nextPremiumDueDate` and stepping forward by one payment-frequency interval — used by
 * `forecaster.ts`'s insurance block to emit one `CashFlowEvent` per real occurrence (2026-08-31
 * redesign) instead of one flat annual event, for Term/Life policies with a schedule set. Empty for
 * Single premium or when `nextPremiumDueDate` is unset (legacy records / no schedule yet) — those keep
 * the original flat annual renewal event instead.
 *
 * **Deliberately allows a bounded look-back before `rangeStartMs`** (default 60 days — comfortably
 * covers both grace periods, 15d Monthly / 30d else): unlike a fixed-day-of-month EMI (which recurs
 * regardless of tracking, so `forecaster.ts`'s own EMI block always rolls a stale due date forward to
 * the next future occurrence with no correctness cost), `nextPremiumDueDate` only ever advances when
 * the user actually taps "Mark as paid" — if they haven't, it sits genuinely overdue, and silently
 * skipping past it here would make `buildReminders()` believe a missed premium already happened. A
 * policy whose `nextPremiumDueDate` has gone stale for far longer than the look-back (e.g. untouched
 * for a year) still only surfaces from `rangeStartMs - overdueLookbackMs` forward, not flooding with a
 * year of missed occurrences.
 */
export function scheduledOccurrencesWithin(
  policy: InsurancePolicy,
  rangeStartMs: number,
  rangeEndMsExclusive: number,
  overdueLookbackMs = 60 * DAY_MS
): number[] {
  const freq = policy.paymentFrequency ?? 'A';
  if (freq === 'S' || policy.nextPremiumDueDate === undefined) return [];
  const months = intervalMonths(freq);
  const effectiveStart = rangeStartMs - overdueLookbackMs;
  const out: number[] = [];
  let d = policy.nextPremiumDueDate;
  while (d < effectiveStart) d = addMonths(d, months);
  while (d < rangeEndMsExclusive) {
    out.push(d);
    d = addMonths(d, months);
  }
  return out;
}

/**
 * True once a Limited Pay Term/Life policy has finished its pay term (`startDate + limitedPayYears`)
 * but is still within cover (`endDate`, if set). This is THE authoritative "paid up" check — the same
 * condition `computeDueStatus()`'s `'paidUp'` branch uses, extracted out (2026-08-31) so every other
 * caller that needs to distinguish "genuinely finished paying" from "no schedule was ever set" can share
 * it instead of re-deriving the condition (or worse, treating both as the same "no `nextPremiumDueDate`"
 * case — see `forecaster.ts`'s insurance block and `useInsurance.ts`'s `sorted` memo for the two real
 * bugs that ambiguity caused once `applyMarkAsPaid()` started actually returning `undefined`). Takes a
 * narrow `Pick` (not a full policy) so a caller never needs to construct/hold an entire `InsurancePolicy`
 * just to ask this question.
 */
export function isPaidUp(
  policy: Pick<InsurancePolicy, 'premiumPaymentTerm' | 'limitedPayYears' | 'startDate' | 'endDate'>,
  nowMs: number
): boolean {
  return (
    policy.premiumPaymentTerm === 'limited' &&
    policy.limitedPayYears !== undefined &&
    policy.startDate !== undefined &&
    nowMs >= addMonths(policy.startDate, policy.limitedPayYears * 12) &&
    (policy.endDate === undefined || nowMs < policy.endDate)
  );
}

export type DueState = 'onTrack' | 'dueSoon' | 'grace' | 'lapsed' | 'paidUp';

export interface DueStatus {
  state: DueState;
  /** Days until due (positive), or days overdue (negative) — relative to `nextPremiumDueDate`. */
  daysUntilDue: number;
  /** Only set when `state === 'grace'` — days left before the policy lapses. */
  graceDaysLeft?: number;
  /** Only set when `state === 'lapsed'` — the last day the policy can still be revived. */
  revivalDeadlineMs?: number;
}

/**
 * Term/Life's due-date state machine (insurance-redesign-v4.html §③/§⑥'s 5 states). `null` when the
 * policy has no recurring schedule to evaluate (Single premium, or `nextPremiumDueDate` unset).
 */
export function computeDueStatus(policy: InsurancePolicy, nowMs: number): DueStatus | null {
  const freq = policy.paymentFrequency ?? 'A';
  if (freq === 'S' || policy.nextPremiumDueDate === undefined) {
    // Limited Pay policies past their pay term, still within cover — "Paid up", no further due dates.
    if (isPaidUp(policy, nowMs)) return { state: 'paidUp', daysUntilDue: 0 };
    return null;
  }

  const daysUntilDue = Math.round((policy.nextPremiumDueDate - nowMs) / DAY_MS);
  if (daysUntilDue > 7) return { state: 'onTrack', daysUntilDue };
  if (daysUntilDue >= 0) return { state: 'dueSoon', daysUntilDue };

  const grace = gracePeriodDays(freq) ?? 0;
  const graceEndMs = policy.nextPremiumDueDate + grace * DAY_MS;
  if (nowMs <= graceEndMs) {
    return { state: 'grace', daysUntilDue, graceDaysLeft: Math.round((graceEndMs - nowMs) / DAY_MS) };
  }

  const revivalYears = revivalWindowYears(policy.isULIP);
  return {
    state: 'lapsed',
    daysUntilDue,
    revivalDeadlineMs: addMonths(policy.nextPremiumDueDate, revivalYears * 12)
  };
}
