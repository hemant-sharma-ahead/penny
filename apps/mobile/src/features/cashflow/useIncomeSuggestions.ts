import { useCallback, useEffect, useMemo, useState } from 'react';
import { expensesRepo } from '@/core/db/repositories';
import { detectRecurringIncome, normalizeIncome, type DetectedIncome } from '@/core/cashflow/incomeDetector';
import { logActivity } from '@/core/db/activityLog';
import type { Expense } from '@/core/db/types';
import { getJSON, setJSON } from '~/lib/storage';

const DISMISSED_KEY = 'penny_income_suggestions_dismissed';

/**
 * RN port of apps/web-legacy/src/features/cashflow/useIncomeSuggestions.ts. Web loads the dismissed-
 * suggestions set synchronously from `localStorage` in a `useState` initializer; `~/lib/storage`'s
 * AsyncStorage wrapper is async, so this loads it in an effect instead (starts empty, then hydrates —
 * one open-app render where a previously dismissed suggestion could flash before the read resolves;
 * acceptable for this non-critical nudge).
 */
export function useIncomeSuggestions(nowMs: number, onConfirmed?: () => void) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    expensesRepo
      .getAll()
      .then(setExpenses)
      .catch(() => {});
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    getJSON<string[]>(DISMISSED_KEY)
      .then((ids) => {
        if (ids) setDismissed(new Set(ids));
      })
      .catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    if (!expenses) return [] as DetectedIncome[];
    // Skip income already marked recurring — it's already feeding the forecast.
    const recurringKeys = new Set(
      expenses
        .filter((e) => (e.type ?? 'expense') === 'income' && e.isRecurring)
        .map((e) => normalizeIncome(e.description))
    );
    return detectRecurringIncome(expenses, nowMs).filter((s) => !recurringKeys.has(s.key) && !dismissed.has(s.key));
  }, [expenses, nowMs, dismissed]);

  const confirm = useCallback(
    async (s: DetectedIncome) => {
      if (!expenses) return;
      // Mark the latest matching income transaction recurring at the detected cadence.
      const matches = expenses
        .filter((e) => (e.type ?? 'expense') === 'income' && normalizeIncome(e.description) === s.key)
        .sort((a, b) => b.date - a.date);
      const latest = matches[0];
      if (!latest) return;
      await expensesRepo.put({
        ...latest,
        isRecurring: true,
        recurringIntervalDays: s.intervalDays,
        updatedAt: Date.now()
      });
      logActivity({
        action: 'UPDATE',
        entityType: 'expense',
        entityId: latest.id,
        summary: `Confirmed recurring income: ${s.label}`
      });
      load();
      onConfirmed?.();
    },
    [expenses, load, onConfirmed]
  );

  const dismiss = useCallback((s: DetectedIncome) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(s.key);
      void setJSON(DISMISSED_KEY, [...next]);
      return next;
    });
  }, []);

  return { suggestions, confirm, dismiss };
}
