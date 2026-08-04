import { useEffect, useRef } from 'react';
import { paymentModesRepo } from '@/core/db/repositories';
import { DEFAULT_PAYMENT_MODES } from '@/core/expenses/paymentModes';
import { useRepository } from '@/hooks/useRepository';
import { getItem, setItem } from '~/lib/storage';

/**
 * Payment modes, defaults + custom, as real persisted rows — mirrors `useExpenses.ts`'s additive
 * default-category seeding (once-per-app via an AsyncStorage flag, non-clobbering: never re-puts a
 * default the user has already edited). Real rows from the start (not a read-time-only merge) is
 * what lets a default's icon/colour/label actually be edited in place, same as a default
 * `ExpenseCategory`. Shared under `~/hooks/` (not a feature module) so both `features/accounts/`
 * (the manage/edit list) and `components/shared/PaymentModeChips.tsx` (the Add-transaction picker)
 * can use it without a cross-feature import.
 */
export function usePaymentModes() {
  const { items, loading, save, remove, reload } = useRepository(paymentModesRepo);
  const seededRef = useRef(false);

  useEffect(() => {
    if (loading || seededRef.current) return;
    seededRef.current = true;
    (async () => {
      if (await getItem('penny_payment_modes_v1')) return;
      const existingIds = new Set(items.map((m) => m.id));
      const missing = DEFAULT_PAYMENT_MODES.filter((m) => !existingIds.has(m.id));
      const now = Date.now();
      await Promise.all(missing.map((m) => paymentModesRepo.put({ ...m, createdAt: now, updatedAt: now })));
      await setItem('penny_payment_modes_v1', '1');
      if (missing.length > 0) reload();
    })().catch(() => {
      seededRef.current = false;
    });
  }, [loading, items, reload]);

  return { modes: items, loading, save, remove, reload };
}
