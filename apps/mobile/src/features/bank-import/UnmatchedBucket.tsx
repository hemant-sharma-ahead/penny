import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { suggestForMerchant } from '@/core/bank-import/merchantMemory';
import { Icon } from '~/components/Icon';
import { Button } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { UseBankImportReturn } from './useBankImport';
import { BulkCategorizeModal } from './BulkCategorizeModal';

interface UnmatchedBucketProps {
  bi: UseBankImportReturn;
  masked: boolean;
}

/** Bucket 3 (mockup `#s3` "Not yet logged") — no candidate found at all; the primary actionable
 *  list. Grouped by normalized merchant key (§7), each occurrence with a checkbox (all checked by
 *  default), "Categorize N selected" opening the bulk modal. Unchecking peels an occurrence off for
 *  a later pass without leaving the group. Bucket and every individual merchant group both start
 *  collapsed (2026-08-03) — a real statement can have dozens of groups each with 50+ occurrences, so
 *  nothing should dump its full contents on-screen unasked. */
export function UnmatchedBucket({ bi, masked }: UnmatchedBucketProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  // Everything starts checked — this tracks the exceptions (unchecked row indices), per merchant key.
  const [uncheckedByGroup, setUncheckedByGroup] = useState<Map<string, Set<number>>>(new Map());
  // Per-merchant-group collapse — a group can run to 50+ occurrences (e.g. a daily recurring
  // merchant), so each one needs to be individually collapsible, not just the bucket as a whole.
  // Seeded (lazily, once) with every group already present at mount so all of them start collapsed —
  // `merchantGroups` only ever shrinks after mount (rows get resolved and removed), never gains a
  // genuinely new key, so this initial snapshot stays a valid superset for the whole review session.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(bi.merchantGroups.map((g) => g.normalizedKey))
  );
  const [categorizing, setCategorizing] = useState<string | null>(null);

  if (bi.unmatchedRows.length === 0) return null;

  function toggleRow(key: string, rowIndex: number) {
    setUncheckedByGroup((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(key) ?? []);
      if (set.has(rowIndex)) set.delete(rowIndex);
      else set.add(rowIndex);
      next.set(key, set);
      return next;
    });
  }

  function toggleGroupCollapsed(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const group = categorizing ? bi.merchantGroups.find((g) => g.normalizedKey === categorizing) : null;
  const checkedRows = group
    ? group.rows.filter((r) => !(uncheckedByGroup.get(group.normalizedKey) ?? new Set()).has(r.rowIndex))
    : [];

  return (
    <View>
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center gap-2 py-1">
        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.info }} />
        <Text className="text-sm font-semibold text-primary flex-1">Not yet logged</Text>
        <Text className="text-xs text-tertiary">
          {bi.unmatchedRows.length} · {bi.merchantGroups.length} merchant{bi.merchantGroups.length === 1 ? '' : 's'}
        </Text>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>

      {expanded && (
        <View className="gap-2 mt-1">
          {bi.merchantGroups.map((g) => {
            const unchecked = uncheckedByGroup.get(g.normalizedKey) ?? new Set<number>();
            const checkedCount = g.rows.filter((r) => !unchecked.has(r.rowIndex)).length;
            const groupCollapsed = collapsedGroups.has(g.normalizedKey);
            return (
              <View key={g.normalizedKey} className="rounded-xl border border-theme overflow-hidden">
                <Pressable
                  onPress={() => toggleGroupCollapsed(g.normalizedKey)}
                  className="flex-row items-center gap-2.5 bg-surface-2 px-3 py-2"
                >
                  <View
                    className="w-7 h-7 rounded-lg items-center justify-center"
                    style={{ backgroundColor: tint(theme.info, 15) }}
                  >
                    <Icon name="ti-building-store" size={14} color={theme.info} />
                  </View>
                  <Text className="text-sm font-semibold text-primary flex-1" numberOfLines={1}>
                    {g.normalizedKey}
                  </Text>
                  <Text className="text-[10px] text-tertiary">
                    {g.rows.length} transaction{g.rows.length === 1 ? '' : 's'}
                  </Text>
                  <Icon
                    name={groupCollapsed ? 'ti-chevron-down' : 'ti-chevron-up'}
                    size={14}
                    color={theme.textTertiary}
                  />
                </Pressable>
                {!groupCollapsed && (
                  <View className="bg-surface">
                    {g.rows.map((row) => {
                      const isChecked = !unchecked.has(row.rowIndex);
                      const amountColor = row.direction === 'debit' ? theme.danger : theme.success;
                      return (
                        <Pressable
                          key={row.rowIndex}
                          onPress={() => toggleRow(g.normalizedKey, row.rowIndex)}
                          className="flex-row items-center gap-2 px-3 py-1.5 border-t border-dashed border-theme"
                        >
                          <View
                            className="w-4 h-4 rounded items-center justify-center border shrink-0"
                            style={{
                              borderColor: isChecked ? theme.primary : theme.border,
                              backgroundColor: isChecked ? theme.primary : 'transparent'
                            }}
                          >
                            {isChecked && <Icon name="ti-check" size={10} color="#fff" />}
                          </View>
                          <View className="flex-1 min-w-0">
                            <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                              {row.rawNarration}
                            </Text>
                            <Text className="text-[10px] text-tertiary" numberOfLines={1}>
                              {formatDate(row.date)}
                              {!isChecked && <Text style={{ color: theme.warning }}> · unchecked</Text>}
                            </Text>
                          </View>
                          <Text className="text-xs font-semibold" style={{ color: amountColor }}>
                            {row.direction === 'debit' ? '−' : '+'}
                            {masked ? '••••' : formatCurrency(row.amount)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View className="px-3 py-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="ti-category"
                        disabled={checkedCount === 0}
                        onPress={() => setCategorizing(g.normalizedKey)}
                      >
                        {`Categorize ${checkedCount} selected ›`}
                      </Button>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {group &&
        (() => {
          const normalizedKey = group.normalizedKey;
          const suggestion = suggestForMerchant(normalizedKey, bi.importRecords, bi.expensesById);
          return (
            <BulkCategorizeModal
              normalizedKey={normalizedKey}
              checkedRows={checkedRows}
              totalInGroup={group.rows.length}
              categories={bi.categories}
              txnCountByCategory={bi.txnCountByCategory}
              hashtags={bi.hashtags}
              iouPersons={bi.iouPersons}
              suggestion={suggestion}
              suggestCashTransferForRow={bi.suggestCashTransferFor}
              suggestPossibleTransferForRow={bi.suggestPossibleTransferFor}
              accounts={bi.accounts.filter((a) => a.id !== bi.account?.id)}
              cashAccounts={bi.cashAccounts}
              onApply={(fields) => {
                bi.resolveMerchantGroup(checkedRows, fields);
                setCategorizing(null);
              }}
              onClose={() => setCategorizing(null)}
            />
          );
        })()}
    </View>
  );
}
