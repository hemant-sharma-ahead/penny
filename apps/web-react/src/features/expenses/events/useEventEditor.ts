import { useState } from 'react';
import type { Expense } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { normalizeHashtag } from '@/context/EventModeContext';

interface UnlinkDialogState {
  outOfRangeCount: number;
  onConfirm: () => void;
  onConfirmUnlink: () => void;
}

/**
 * Encapsulates the "edit event" flow: when an immersive event's end date shrinks and leaves
 * already-linked transactions out of range, prompts the user to keep them linked or unlink them.
 */
export function useEventEditor(
  expenses: Expense[],
  saveExpense: (e: Expense) => Promise<void>,
  updateEvent: (id: string, updates: Partial<Omit<ActiveEvent, 'id'>>) => void
) {
  const [unlinkDialog, setUnlinkDialog] = useState<UnlinkDialogState | null>(null);

  function handleEditEventSave(
    ev: ActiveEvent,
    edits: { name: string; color: string; startDate: string; endDate: string }
  ) {
    const newName = edits.name.trim();
    if (!newName) return;
    const newStartMs = new Date(edits.startDate).getTime();
    const updates: Partial<Omit<ActiveEvent, 'id'>> = { name: newName, color: edits.color, startDate: newStartMs };
    if (ev.subtype === 'immersive' && edits.endDate) {
      const newEndMs = new Date(edits.endDate + 'T23:59:59').getTime();
      updates.endDate = newEndMs;
      const oldEndMs = ev.endDate;
      if (oldEndMs !== undefined && newEndMs < oldEndMs) {
        const eventNorm = normalizeHashtag(ev.hashtag);
        const outOfRange = expenses.filter(
          (e) => e.hashtags.some((t) => normalizeHashtag(t) === eventNorm) && (e.date > newEndMs || e.date < newStartMs)
        );
        if (outOfRange.length > 0) {
          setUnlinkDialog({
            outOfRangeCount: outOfRange.length,
            onConfirm: () => {
              updateEvent(ev.id, updates);
              setUnlinkDialog(null);
            },
            onConfirmUnlink: () => {
              const norm = normalizeHashtag(ev.hashtag);
              outOfRange.forEach((e) => {
                saveExpense({ ...e, hashtags: e.hashtags.filter((t) => normalizeHashtag(t) !== norm) }).catch(() => {});
              });
              updateEvent(ev.id, updates);
              setUnlinkDialog(null);
            }
          });
          return;
        }
      }
    } else if (!edits.endDate) {
      updates.endDate = undefined;
    }
    updateEvent(ev.id, updates);
  }

  return { unlinkDialog, closeUnlinkDialog: () => setUnlinkDialog(null), handleEditEventSave };
}
