import { useCallback, useMemo, useState } from 'react';
import { subscriptionsRepo } from '@/core/db/repositories';
import type { Expense, Subscription } from '@/core/db/types';
import { useLoggedRepository } from '@/hooks/useLoggedRepository';
import { detectSubscriptions, type DetectedSubscription } from '@/core/subscriptions/detector';
import { subKey, toAnnual, nextRenewal } from '@/core/subscriptions/format';

/** Fields the user supplies when adding a subscription by hand. */
export type ManualSubscription = Pick<
  Subscription,
  'merchantCategory' | 'detectedAmount' | 'intervalDays' | 'status' | 'lastChargedAt' | 'trialEndsAt'
>;

const summarizeSubscription = (s: Subscription) => `subscription: ${s.merchantCategory}`;

export function useSubscriptions(expenses: Expense[]) {
  const [nowMs] = useState(() => Date.now());
  const { items: stored, save: saveSubscription } = useLoggedRepository(subscriptionsRepo, {
    entityType: 'subscription',
    summarize: summarizeSubscription,
    diffFields: ['status', 'detectedAmount', 'confirmedByUser']
  });

  const detectedSubs = useMemo(() => {
    if (expenses.length === 0) return [];
    const candidates = detectSubscriptions(expenses, nowMs);
    const storedKeys = new Set(stored.map((s) => subKey(s)));
    return candidates.filter((c) => !storedKeys.has(subKey(c)));
  }, [expenses, stored, nowMs]);

  // Active subs ordered by their next renewal (soonest first) — a renewal calendar.
  const activeSubs = useMemo(
    () =>
      stored
        .filter((s) => s.confirmedByUser && s.status !== 'cancelled')
        .sort((a, b) => (nextRenewal(a, nowMs) ?? Infinity) - (nextRenewal(b, nowMs) ?? Infinity)),
    [stored, nowMs]
  );

  const subsMonthlyTotal = useMemo(
    () => activeSubs.reduce((sum, s) => sum + (s.detectedAmount / s.intervalDays) * 30, 0),
    [activeSubs]
  );

  const subsAnnualTotal = useMemo(
    () => activeSubs.reduce((sum, s) => sum + toAnnual(s.detectedAmount, s.intervalDays), 0),
    [activeSubs]
  );

  const confirmSubscription = useCallback(
    (candidate: DetectedSubscription) => {
      const sub: Subscription = {
        id: crypto.randomUUID(),
        merchantCategory: candidate.merchantCategory,
        detectedAmount: candidate.detectedAmount,
        intervalDays: candidate.intervalDays,
        status: candidate.status,
        confirmedByUser: true,
        createdAt: nowMs,
        updatedAt: nowMs
      };
      if (candidate.trialEndsAt !== undefined) sub.trialEndsAt = candidate.trialEndsAt;
      if (candidate.lastChargedAt !== undefined) sub.lastChargedAt = candidate.lastChargedAt;
      saveSubscription(sub).catch(() => {});
    },
    [saveSubscription, nowMs]
  );

  const dismissSubscription = useCallback(
    (candidate: DetectedSubscription) => {
      const sub: Subscription = {
        id: crypto.randomUUID(),
        merchantCategory: candidate.merchantCategory,
        detectedAmount: candidate.detectedAmount,
        intervalDays: candidate.intervalDays,
        status: 'cancelled',
        confirmedByUser: false,
        createdAt: nowMs,
        updatedAt: nowMs
      };
      if (candidate.lastChargedAt !== undefined) sub.lastChargedAt = candidate.lastChargedAt;
      saveSubscription(sub).catch(() => {});
    },
    [saveSubscription, nowMs]
  );

  const cancelSubscription = useCallback(
    (sub: Subscription) => {
      saveSubscription({ ...sub, status: 'cancelled', updatedAt: nowMs }).catch(() => {});
    },
    [saveSubscription, nowMs]
  );

  /** Add a subscription by hand (confirmed, tracked immediately). */
  const addSubscription = useCallback(
    (input: ManualSubscription) => {
      const sub: Subscription = {
        id: crypto.randomUUID(),
        merchantCategory: input.merchantCategory,
        detectedAmount: input.detectedAmount,
        intervalDays: input.intervalDays,
        status: input.status,
        confirmedByUser: true,
        createdAt: nowMs,
        updatedAt: nowMs,
        ...(input.lastChargedAt !== undefined && { lastChargedAt: input.lastChargedAt }),
        ...(input.trialEndsAt !== undefined && { trialEndsAt: input.trialEndsAt })
      };
      saveSubscription(sub).catch(() => {});
    },
    [saveSubscription, nowMs]
  );

  return {
    stored,
    detectedSubs,
    activeSubs,
    subsMonthlyTotal,
    subsAnnualTotal,
    confirmSubscription,
    dismissSubscription,
    cancelSubscription,
    addSubscription
  };
}
