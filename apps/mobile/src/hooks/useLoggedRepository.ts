import { useCallback } from 'react';
import { useRepository } from '@/hooks/useRepository';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
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
        }
      });
    },
    [items, baseRemove, reload, showToast, entityType, summarize]
  );

  return { ...base, save, remove };
}
