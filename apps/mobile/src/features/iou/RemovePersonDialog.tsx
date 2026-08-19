import { useState } from 'react';
import { View, Text } from 'react-native';
import type { Person } from '@/core/db/types';
import { isSettled } from '@/core/iou/ledger';
import { formatCurrency } from '@/lib/formatters';
import { Modal, Button, ConfirmDialog } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';

interface RemovePersonDialogProps {
  person: Person;
  /** Net balance: positive ⇒ they owe you; negative ⇒ you owe them. */
  net: number;
  /** Omit when the person is already archived (the Archived section's own trash icon) — there's
   *  nothing to "archive instead" of, since they're already there. */
  onArchive?: (() => Promise<void>) | undefined;
  /** The fixed, non-cascading purge (item 8's bug fix) — deletes only the Person + their
   *  `ledger_entries`; any linked `Expense` rows survive (keep their category, just lose the IOU
   *  person link — the link only ever lived on the `LedgerEntry` side). */
  onDeletePermanently: () => Promise<void>;
  /** Opens the real Settle Up flow. Omit only if genuinely unreachable from the caller. */
  onSettleUp?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Consolidated delete/archive confirmation for a person WITH real ledger history (item 8,
 * docs/plans/real-device-testing-pass.md Phase 2 — see docs/mockups/proposals/iou-quick-fixes-v1.html
 * §3). The one place both `PersonForm.tsx`'s "Remove" button and `IouView.tsx`'s Archived-row trash icon
 * route through, replacing two independently-silent delete paths (`useIou.ts`'s old silent auto-archive
 * and `IouView.tsx`'s old unguarded `purgePerson`) with a single real confirm step.
 *
 * A person with zero ledger entries never reaches this component at all — that case stays today's
 * direct hard-delete, no popup (the caller decides this before rendering, since it needs `entriesFor()`
 * to know).
 */
export function RemovePersonDialog({
  person,
  net,
  onArchive,
  onDeletePermanently,
  onSettleUp,
  onClose
}: RemovePersonDialogProps) {
  const theme = useThemeColors();
  const settled = isSettled(net);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function runDelete() {
    setBusy(true);
    try {
      await onDeletePermanently();
    } finally {
      setBusy(false);
    }
  }

  async function runArchive() {
    if (!onArchive) return;
    setBusy(true);
    try {
      await onArchive();
    } finally {
      setBusy(false);
    }
  }

  // Second tier — a real second tap via the standard `ConfirmDialog`, whether reached from the settled
  // variant's plain "Delete permanently" or the outstanding-balance variant's de-emphasized "Delete
  // permanently anyway" link. Same component either way — only the message differs.
  if (confirmingDelete) {
    return (
      <ConfirmDialog
        isOpen
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void runDelete()}
        title={`Delete ${person.name}?`}
        message={
          settled
            ? `This can't be undone. ${person.name}'s ledger entries will be gone — their recorded transactions stay in Transactions, just unlinked from ${person.name}.`
            : `This can't be undone. The ${formatCurrency(Math.abs(net))} balance and ${person.name}'s ledger entries will be gone — their recorded transactions stay in Transactions, just unlinked from ${person.name}.`
        }
        confirmLabel="Delete"
        loading={busy}
      />
    );
  }

  if (settled) {
    return (
      <Modal
        onClose={onClose}
        title={`Remove ${person.name}?`}
        footer={
          <View className="gap-2">
            {onArchive && (
              <Button variant="secondary" fullWidth loading={busy} onPress={() => void runArchive()}>
                Archive
              </Button>
            )}
            <Button variant="danger" fullWidth onPress={() => setConfirmingDelete(true)}>
              Delete permanently
            </Button>
          </View>
        }
      >
        <Text className="text-sm text-secondary leading-relaxed">
          You&apos;re settled up.{' '}
          {onArchive
            ? 'Archive keeps everything for later — Delete removes them from your people list and their ledger entries.'
            : 'Delete removes them from your people list and their ledger entries.'}{' '}
          <Text className="font-semibold text-primary">
            Their recorded transactions stay in the Transactions tab either way.
          </Text>
        </Text>
      </Modal>
    );
  }

  // Outstanding balance — lead with the amount owed, steer toward Settle Up / Archive; permanent
  // delete is still reachable but de-emphasized (a strong warning, not a hard block — approved
  // direction, see the mockup's closing notes §3).
  const balanceColor = net > 0 ? theme.success : theme.danger;
  return (
    <Modal
      onClose={onClose}
      title={net > 0 ? `Wait — ${person.name} owes you` : `Wait — you owe ${person.name}`}
      footer={
        <View className="gap-2">
          {onSettleUp && (
            <Button variant="primary" fullWidth onPress={onSettleUp}>
              Settle Up
            </Button>
          )}
          {onArchive && (
            <Button variant="secondary" fullWidth loading={busy} onPress={() => void runArchive()}>
              Archive instead
            </Button>
          )}
          <Button variant="ghost" size="sm" textColor={theme.danger} onPress={() => setConfirmingDelete(true)}>
            Delete permanently anyway
          </Button>
        </View>
      }
    >
      <View className="items-center gap-1 py-1">
        <Text className="text-2xl font-extrabold" style={{ color: balanceColor }}>
          {formatCurrency(Math.abs(net))}
        </Text>
        <Text className="text-sm text-secondary text-center leading-relaxed">
          still outstanding. Deleting now would erase this balance with no record — settle up or archive instead.
        </Text>
      </View>
    </Modal>
  );
}
