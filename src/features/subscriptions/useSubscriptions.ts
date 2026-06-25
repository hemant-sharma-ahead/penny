import { useCallback, useMemo, useState } from 'react';
import { subscriptionsRepo } from '@/core/db/repositories';
import type { Expense, Subscription } from '@/core/db/types';
import { useLoggedRepository } from '@/hooks/useLoggedRepository';
import { detectSubscriptions, type DetectedSubscription } from '@/core/subscriptions/detector';
import { subKey } from '@/core/subscriptions/format';

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

  const activeSubs = useMemo(() => stored.filter((s) => s.confirmedByUser && s.status !== 'cancelled'), [stored]);

  const subsMonthlyTotal = useMemo(
    () => activeSubs.reduce((sum, s) => sum + (s.detectedAmount / s.intervalDays) * 30, 0),
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

  return {
    stored,
    detectedSubs,
    activeSubs,
    subsMonthlyTotal,
    confirmSubscription,
    dismissSubscription,
    cancelSubscription
  };
}
