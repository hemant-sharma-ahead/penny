import { useCallback } from 'react';
import { useRepository } from '@/hooks/useRepository';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { useToast } from '~/context/ToastContext';
import type { EncryptedRepository } from '@/core/db/repository';

interface LoggedOptions<T> {
  /** entity key for the activity log + restore registry, e.g. 'goal', 'account' */
  entityType: string;
  /** human label for an item, e.g. (g) => `goal: ${g.name}` */
  summarize: (item: T) => string;
  /** fields to diff on UPDATE (for beautiful diffs / future revert) */
  diffFields?: (keyof T)[];
}

/**
 * RN port of apps/web-react/src/hooks/useLoggedRepository.ts — same logic, unchanged; only the
 * `useToast` import points at the mobile `ToastContext`.
 * Drop-in replacement for `useRepository` that records CREATE/UPDATE on save and DELETE on remove,
 * and shows an Undo toast (restore + reload) after a delete. Same return shape as `useRepository`.
 *
 * **Broadcasts `notifyTxnChanged()` on every save/remove** (2026-08-31 fix) — this is the shared base
 * for Insurance/Loans/Goals/Budgets/IOU/Subscriptions, and it never called this itself; individually,
 * `usePortfolioHoldings.ts`/`useGoals.ts` had already worked around the gap by calling it at their own
 * call sites, but Insurance/Loans/Budgets/IOU/Subscriptions hadn't — a real reported bug: adding an
 * insurance policy never made Home's "Track Insurance" prompt (`useHomeStats.ts`, subscribed via
 * `useTxnRefresh`) disappear until a full app restart. Fixing it here, once, covers every current and
 * future consumer instead of requiring each one to remember it independently. Safe to call alongside an
 * already-present call site — `notifyTxnChanged()` is coalesced onto one microtask flush regardless of
 * how many times it's invoked in the same tick.
 */
export function useLoggedRepository<T extends { id: string }>(repo: EncryptedRepository<T>, options: LoggedOptions<T>) {
  const { entityType, summarize, diffFields } = options;
  const base = useRepository(repo);
  const { items, save: baseSave, remove: baseRemove, reload } = base;
  const { showToast } = useToast();

  const save = useCallback(
    async (item: T) => {
      const existing = items.find((i) => i.id === item.id);
      await baseSave(item);
      if (existing) {
        const diff = diffFields ? summarizeDiff(existing, item, diffFields) : undefined;
        logActivity({
          action: 'UPDATE',
          entityType,
          entityId: item.id,
          summary: `Updated ${summarize(item)}`,
          ...(diff ? { diff } : {})
        });
      } else {
        logActivity({ action: 'CREATE', entityType, entityId: item.id, summary: `Added ${summarize(item)}` });
      }
      notifyTxnChanged();
    },
    [items, baseSave, entityType, summarize, diffFields]
  );

  const remove = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      await baseRemove(id);
      if (!item) return;
      const label = summarize(item);
      const logId = logActivity({
        action: 'DELETE',
        entityType,
        entityId: id,
        summary: `Deleted ${label}`,
        snapshot: JSON.stringify(item)
      });
      showToast({
        message: `Deleted ${label}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reload();
          notifyTxnChanged();
        }
      });
      notifyTxnChanged();
    },
    [items, baseRemove, reload, showToast, entityType, summarize]
  );

  return { ...base, save, remove };
}
