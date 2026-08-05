import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Expense } from '@/core/db/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Icon } from '~/components/Icon';
import { Button, ConfirmDialog } from '~/components/ui';
import { ExpenseForm } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseBankImportReturn } from './useBankImport';

interface LoneWolfBucketProps {
  bi: UseBankImportReturn;
  masked: boolean;
}

/** Bucket 4 (mockup `#s3`/`#s7`) — a recorded transaction with no statement counterpart at all.
 *  Could be a duplicate, a mis-logged account, or genuinely fine — action is Keep / Edit / Delete at
 *  the user's discretion (docs/plans/bank-statement-import.md §5/§6). Delete is staged, only actually
 *  removed on the final Import tap (§10b), so it's reversible until then. Collapsed by default
 *  (2026-08-03, matches every other bucket). */
export function LoneWolfBucket({ bi, masked }: LoneWolfBucketProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Reactive — not the frozen `matchResult.loneWolves` (see `useBankImport.ts`'s own `loneWolves`
  // doc comment): an expense bumped by a reassignment, or freed up when a possible-match item is
  // resolved/dismissed elsewhere, must resurface here rather than vanishing from the review entirely.
  const loneWolves = bi.loneWolves;
  if (loneWolves.length === 0) return null;

  return (
    <View>
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center gap-2 py-1">
        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.danger }} />
        <Text className="text-sm font-semibold text-primary flex-1">Recorded, not in statement</Text>
        <Text className="text-xs text-tertiary">{loneWolves.length}</Text>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>

      {expanded && (
        <View className="gap-1.5 mt-1">
          {loneWolves.map(({ expense, nearEdge }) => {
            const pendingDelete = bi.loneWolfDeletions.has(expense.id);
            return (
              <View
                key={expense.id}
                className="rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: pendingDelete ? theme.danger : '#4a2a1c',
                  backgroundColor: '#1f150e',
                  opacity: pendingDelete ? 0.6 : 1
                }}
              >
                <View className="flex-row items-center gap-2.5">
                  <View
                    className="w-7 h-7 rounded-lg items-center justify-center shrink-0"
                    style={{ backgroundColor: '#3a2412' }}
                  >
                    <Icon name="ti-alert-triangle" size={14} color={theme.warning} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                      &ldquo;{expense.description}&rdquo; — {masked ? '••••' : formatCurrency(expense.amount)}
                    </Text>
                    <Text className="text-[11px] mt-0.5" style={{ color: theme.warning }}>
                      Logged {formatDate(expense.date)} ·{' '}
                      {pendingDelete
                        ? 'marked for deletion — reverts if you leave without importing'
                        : nearEdge
                          ? 'near the edge of this statement’s range — may appear in an adjacent one'
                          : 'no statement line found'}
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-1.5 mt-2">
                  {pendingDelete ? (
                    <Button variant="secondary" size="sm" onPress={() => bi.unmarkLoneWolfForDeletion(expense.id)}>
                      Undo delete
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" icon="ti-pencil" onPress={() => setEditing(expense)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="ti-trash"
                        textColor={theme.danger}
                        onPress={() => setConfirmingDeleteId(expense.id)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <ConfirmDialog
        isOpen={!!confirmingDeleteId}
        onClose={() => setConfirmingDeleteId(null)}
        onConfirm={() => {
          if (confirmingDeleteId) bi.markLoneWolfForDeletion(confirmingDeleteId);
          setConfirmingDeleteId(null);
        }}
        title="Delete this transaction?"
        message="It'll be removed once you tap Import on the review screen — leaving without importing reverts this."
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      {editing && (
        <ExpenseForm
          categories={bi.categories}
          hashtags={bi.hashtags}
          editing={editing}
          activeEvents={[]}
          saveAccount={bi.saveAccountForForm}
          searchMerchant={() => []}
          onSave={async (expense) => {
            await bi.saveEditedLoneWolf(expense);
            setEditing(null);
          }}
          onDelete={async (id) => {
            bi.markLoneWolfForDeletion(id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}
