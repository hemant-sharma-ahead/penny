import { useCallback, useEffect, useMemo, useState } from 'react';
import { expensesRepo } from '@/core/db/repositories';
import { detectRecurringIncome, normalizeIncome, type DetectedIncome } from '@/core/cashflow/incomeDetector';
import { logActivity } from '@/core/db/activityLog';
import type { Expense } from '@/core/db/types';

const DISMISSED_KEY = 'penny_income_suggestions_dismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Surfaces recurring-income suggestions for the cash-flow forecast. Confirming
 * marks the most recent matching income transaction as recurring, so the
 * forecast projects a payday; dismissing remembers the choice locally.
 * `onConfirmed` lets the page refresh the forecast after a confirm.
 */
export function useIncomeSuggestions(nowMs: number, onConfirmed?: () => void) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const load = useCallback(() => {
    expensesRepo
      .getAll()
      .then(setExpenses)
      .catch(() => {});
  }, []);

  useEffect(() => load(), [load]);

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
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { suggestions, confirm, dismiss };
}
