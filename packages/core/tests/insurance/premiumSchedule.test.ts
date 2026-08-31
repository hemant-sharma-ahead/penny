import { describe, expect, it } from 'vitest';
import {
  addMonths,
  applyMarkAsPaid,
  applyUnmarkPayment,
  computeDueStatus,
  firstNextDueDate,
  gracePeriodDays,
  installmentAmount,
  isPaidUp,
  periodsPerYear,
  revivalWindowYears,
  scheduledOccurrencesWithin
} from '@/core/insurance/premiumSchedule';
import type { InsurancePolicy } from '@/core/db/types';

const DAY = 86_400_000;

const makePolicy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 'p1',
  type: 'term',
  insurer: 'HDFC Life',
  coverageAmount: 10000000,
  annualPremium: 12000,
  renewalDate: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('periodsPerYear / gracePeriodDays / revivalWindowYears', () => {
  it('maps frequency to installments per year', () => {
    expect(periodsPerYear('M')).toBe(12);
    expect(periodsPerYear('Q')).toBe(4);
    expect(periodsPerYear('H')).toBe(2);
    expect(periodsPerYear('A')).toBe(1);
  });

  it('grace period is 15 days for Monthly, 30 for everything else recurring, null for Single', () => {
    expect(gracePeriodDays('M')).toBe(15);
    expect(gracePeriodDays('Q')).toBe(30);
    expect(gracePeriodDays('H')).toBe(30);
    expect(gracePeriodDays('A')).toBe(30);
    expect(gracePeriodDays('S')).toBeNull();
  });

  it('revival window is 3 years for ULIP, 5 for non-linked', () => {
    expect(revivalWindowYears(true)).toBe(3);
    expect(revivalWindowYears(false)).toBe(5);
    expect(revivalWindowYears(undefined)).toBe(5);
  });
});

describe('addMonths', () => {
  it('wraps across year boundaries correctly', () => {
    const start = new Date(2026, 10, 30).getTime(); // 30 Nov 2026
    const result = new Date(addMonths(start, 3));
    // 30 Nov + 3mo = "28 Feb 2027 + 2 days" since Feb 2027 (non-leap) only has 28 days — JS's own
    // Date month-overflow rule (same one forecaster.ts's EMI stepping already relies on), not a bug.
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(2); // rolled into March
    expect(result.getDate()).toBe(2);
  });
});

describe('installmentAmount', () => {
  it('divides evenly by frequency with no discount', () => {
    const p = makePolicy({ annualPremium: 12000, paymentFrequency: 'M' });
    expect(installmentAmount(p, Date.now())).toBe(1000);
  });

  it('applies a % first-year discount only within one year of startDate', () => {
    const start = new Date(2026, 0, 1).getTime();
    const p = makePolicy({
      annualPremium: 12000,
      paymentFrequency: 'M',
      startDate: start,
      firstYearDiscountEnabled: true,
      discountType: 'pct',
      discountValue: 10
    });
    // Year 1 — 12000 * 0.9 / 12 = 900
    expect(installmentAmount(p, new Date(2026, 6, 1).getTime())).toBe(900);
    // Year 2+ — full 12000 / 12 = 1000
    expect(installmentAmount(p, new Date(2027, 6, 1).getTime())).toBe(1000);
  });

  it('applies a flat rupee first-year discount', () => {
    const start = new Date(2026, 0, 1).getTime();
    const p = makePolicy({
      annualPremium: 12000,
      paymentFrequency: 'A',
      startDate: start,
      firstYearDiscountEnabled: true,
      discountType: 'flat',
      discountValue: 1200
    });
    expect(installmentAmount(p, start)).toBe(10800);
  });

  it('Single premium pays the full (possibly discounted) annual amount once', () => {
    const p = makePolicy({ annualPremium: 50000, paymentFrequency: 'S' });
    expect(installmentAmount(p, Date.now())).toBe(50000);
  });
});

describe('firstNextDueDate', () => {
  it('is one interval after startDate', () => {
    const start = new Date(2026, 0, 1).getTime();
    const next = firstNextDueDate({ startDate: start, paymentFrequency: 'M' });
    expect(next).toBe(new Date(2026, 1, 1).getTime());
  });

  it('is undefined for Single premium or no start date', () => {
    expect(firstNextDueDate({ startDate: Date.now(), paymentFrequency: 'S' })).toBeUndefined();
    expect(firstNextDueDate({ paymentFrequency: 'M' })).toBeUndefined();
  });
});

describe('applyMarkAsPaid / applyUnmarkPayment', () => {
  it('appends a payment and rolls the next due date forward by one interval', () => {
    const due = new Date(2026, 8, 1).getTime();
    const p = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: due, annualPremium: 12000 });
    const paidMs = due + 2 * DAY;
    const result = applyMarkAsPaid(p, paidMs, 'exp-1');
    expect(result.premiumPayments).toHaveLength(1);
    expect(result.premiumPayments[0]).toMatchObject({ dueMs: due, paidMs, amount: 1000, linkedExpenseId: 'exp-1' });
    expect(result.nextPremiumDueDate).toBe(new Date(2026, 9, 1).getTime());
    expect(result.nextPremiumDueDateIsCustom).toBe(false);
  });

  it('omits linkedExpenseId when skipped', () => {
    const due = new Date(2026, 8, 1).getTime();
    const p = makePolicy({ paymentFrequency: 'A', nextPremiumDueDate: due });
    const result = applyMarkAsPaid(p, due);
    expect(result.premiumPayments[0]?.linkedExpenseId).toBeUndefined();
  });

  it('reverses only the most recent payment and rolls the due date back', () => {
    const due1 = new Date(2026, 6, 1).getTime();
    const p1 = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: due1 });
    const step1 = applyMarkAsPaid(p1, due1);
    const p2: InsurancePolicy = { ...p1, ...step1 };
    const step2 = applyMarkAsPaid(p2, step1.nextPremiumDueDate ?? 0);
    const p3: InsurancePolicy = { ...p2, ...step2 };

    const payments = p3.premiumPayments ?? [];
    expect(payments).toHaveLength(2);
    const reverted = applyUnmarkPayment(p3, payments[1]?.id ?? '');
    expect(reverted).not.toBeNull();
    expect(reverted?.premiumPayments).toHaveLength(1);
    expect(reverted?.nextPremiumDueDate).toBe(step1.nextPremiumDueDate);
  });

  it('refuses to reverse anything but the most recent payment', () => {
    const due1 = new Date(2026, 6, 1).getTime();
    const p1 = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: due1 });
    const step1 = applyMarkAsPaid(p1, due1);
    const p2: InsurancePolicy = { ...p1, ...step1 };
    const step2 = applyMarkAsPaid(p2, step1.nextPremiumDueDate ?? 0);
    const p3: InsurancePolicy = { ...p2, ...step2 };

    const payments = p3.premiumPayments ?? [];
    expect(payments).toHaveLength(2);
    expect(applyUnmarkPayment(p3, payments[0]?.id ?? '')).toBeNull();
  });

  it('Limited Pay: marking the FINAL installment of the pay term clears nextPremiumDueDate (a real gap, fixed 2026-08-31)', () => {
    // "Pay for 7 years, stay covered for 15" — the exact scenario this feature was built around.
    const start = new Date(2020, 0, 1).getTime();
    const lastInstallmentDue = addMonths(start, 6 * 12); // the 7th (final) Annual installment
    const p = makePolicy({
      paymentFrequency: 'A',
      premiumPaymentTerm: 'limited',
      limitedPayYears: 7,
      startDate: start,
      endDate: addMonths(start, 15 * 12),
      nextPremiumDueDate: lastInstallmentDue
    });

    const result = applyMarkAsPaid(p, lastInstallmentDue);
    // The final installment is still recorded correctly, with its real due amount...
    expect(result.premiumPayments).toHaveLength(1);
    expect(result.premiumPayments[0]).toMatchObject({ dueMs: lastInstallmentDue, amount: p.annualPremium });
    // ...but nothing schedules after it — this is the ONLY code path that produces `undefined` here.
    expect(result.nextPremiumDueDate).toBeUndefined();

    const paidUpPolicy: InsurancePolicy = { ...p, ...result };
    const wellWithinCover = addMonths(start, 10 * 12); // year 10 of 15 — pay term done, still covered
    expect(computeDueStatus(paidUpPolicy, wellWithinCover)?.state).toBe('paidUp');
    expect(isPaidUp(paidUpPolicy, wellWithinCover)).toBe(true);
    // A regular (non-final) installment along the way must NOT trip this early.
    expect(isPaidUp(p, addMonths(start, 3 * 12))).toBe(false);
  });
});

describe('isPaidUp', () => {
  it('is false for a Regular (non-Limited-Pay) policy regardless of elapsed time', () => {
    const start = new Date(2020, 0, 1).getTime();
    expect(isPaidUp(makePolicy({ premiumPaymentTerm: 'regular', startDate: start }), addMonths(start, 240))).toBe(
      false
    );
  });

  it('is false before the pay term completes, true after, false again once cover itself ends', () => {
    const start = new Date(2020, 0, 1).getTime();
    const p = makePolicy({
      premiumPaymentTerm: 'limited',
      limitedPayYears: 7,
      startDate: start,
      endDate: addMonths(start, 15 * 12)
    });
    expect(isPaidUp(p, addMonths(start, 6 * 12))).toBe(false); // still paying
    expect(isPaidUp(p, addMonths(start, 7 * 12))).toBe(true); // pay term just completed
    expect(isPaidUp(p, addMonths(start, 20 * 12))).toBe(false); // cover itself has since ended
  });
});

describe('scheduledOccurrencesWithin', () => {
  it('emits one occurrence per interval within the range', () => {
    const start = new Date(2026, 0, 1).getTime();
    const p = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: start });
    const rangeEnd = new Date(2026, 3, 1).getTime(); // 3 months later
    const occurrences = scheduledOccurrencesWithin(p, start, rangeEnd);
    expect(occurrences).toEqual([
      new Date(2026, 0, 1).getTime(),
      new Date(2026, 1, 1).getTime(),
      new Date(2026, 2, 1).getTime()
    ]);
  });

  it('surfaces a recently-overdue occurrence instead of silently skipping it', () => {
    const rangeStart = new Date(2026, 5, 10).getTime();
    const overdueDue = rangeStart - 5 * DAY; // 5 days before "today"
    const p = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: overdueDue });
    const occurrences = scheduledOccurrencesWithin(p, rangeStart, rangeStart + 30 * DAY);
    expect(occurrences[0]).toBe(overdueDue);
  });

  it('is empty for Single premium or an unset schedule', () => {
    expect(scheduledOccurrencesWithin(makePolicy({ paymentFrequency: 'S' }), 0, 1e15)).toEqual([]);
    expect(scheduledOccurrencesWithin(makePolicy({}), 0, 1e15)).toEqual([]);
  });
});

describe('computeDueStatus', () => {
  const now = new Date(2026, 5, 15).getTime();

  it('onTrack when due date is more than 7 days away', () => {
    const p = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: now + 20 * DAY });
    expect(computeDueStatus(p, now)?.state).toBe('onTrack');
  });

  it('dueSoon within 7 days', () => {
    const p = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: now + 3 * DAY });
    expect(computeDueStatus(p, now)?.state).toBe('dueSoon');
  });

  it('grace after the due date but within the grace window', () => {
    const p = makePolicy({ paymentFrequency: 'M', nextPremiumDueDate: now - 5 * DAY });
    const status = computeDueStatus(p, now);
    expect(status?.state).toBe('grace');
    expect(status?.graceDaysLeft).toBe(10); // 15-day Monthly grace, 5 days elapsed
  });

  it('lapsed once the grace window has passed, with a revival deadline', () => {
    const p = makePolicy({ paymentFrequency: 'A', nextPremiumDueDate: now - 40 * DAY, isULIP: false });
    const status = computeDueStatus(p, now);
    expect(status?.state).toBe('lapsed');
    expect(status?.revivalDeadlineMs).toBe(addMonths(p.nextPremiumDueDate ?? 0, 60));
  });

  it('paidUp for a limited-pay policy past its pay term but still within cover', () => {
    const start = new Date(2016, 0, 1).getTime();
    const p = makePolicy({
      paymentFrequency: 'S',
      premiumPaymentTerm: 'limited',
      limitedPayYears: 5,
      startDate: start,
      endDate: new Date(2036, 0, 1).getTime()
    });
    expect(computeDueStatus(p, now)?.state).toBe('paidUp');
  });

  it('null when there is no schedule to evaluate', () => {
    expect(computeDueStatus(makePolicy({ paymentFrequency: 'S' }), now)).toBeNull();
  });
});
