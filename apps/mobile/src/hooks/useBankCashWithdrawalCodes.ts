import { useEffect, useRef } from 'react';
import { bankCashWithdrawalCodesRepo } from '@/core/db/repositories';
import { BANK_CASH_WITHDRAWAL_CODE_SEEDS } from '@/core/bank-import/cashWithdrawalCodes';
import { useRepository } from '@/hooks/useRepository';
import { getItem, setItem } from '~/lib/storage';

/**
 * Cash-withdrawal narration codes (ATW, NWD, SELF, ...), defaults + custom, as real persisted rows —
 * mirrors `usePaymentModes.ts`'s exact seeding pattern (once-per-app via an AsyncStorage flag,
 * non-clobbering: never re-puts a default the user has already edited/deleted). Real rows from the
 * start is what lets a researched default be edited or removed in place, same as a default payment
 * mode or expense category. Shared under `~/hooks/` so both the management screen and the review
 * screen's auto-classification (2026-08-05 transfer-marking work) can read the same live list without
 * a cross-feature import.
 */
export function useBankCashWithdrawalCodes() {
  const { items, loading, save, remove, reload } = useRepository(bankCashWithdrawalCodesRepo);
  const seededRef = useRef(false);

  useEffect(() => {
    if (loading || seededRef.current) return;
    seededRef.current = true;
    (async () => {
      // v2 (2026-08-27): added the 3 deposit-direction seeds (CDM/CASH DEP/CDEP) — bumped from v1 so
      // those actually reach a device that already seeded v1's withdrawal-only defaults, matching the
      // non-clobbering "missing ids only" re-seed below (never touches an id the user already has,
      // whether default or since-edited/deleted).
      if (await getItem('penny_cash_withdrawal_codes_v2')) return;
      const existingIds = new Set(items.map((c) => c.id));
      const missing = BANK_CASH_WITHDRAWAL_CODE_SEEDS.filter((c) => !existingIds.has(c.id));
      const now = Date.now();
      await Promise.all(
        missing.map((c) =>
          bankCashWithdrawalCodesRepo.put({
            id: c.id,
            bankId: c.bankId,
            code: c.code,
            label: c.label,
            direction: c.direction,
            isDefault: true,
            createdAt: now,
            updatedAt: now
          })
        )
      );
      await setItem('penny_cash_withdrawal_codes_v2', '1');
      if (missing.length > 0) reload();
    })().catch(() => {
      seededRef.current = false;
    });
  }, [loading, items, reload]);

  return { codes: items, loading, save, remove, reload };
}
