// EPF import reconciliation review — Direction C, conflict-first triage (mockup v4 §2, chosen over a
// bank-import-style bucket accordion and a chronological single list — see
// docs/plans/epf-passbook-import.md §10.2 for why). The one real conflict (if any) is pinned open at
// the top under "Needs your decision"; new rows render as a pre-checked, individually-toggleable
// checklist (borrowed from bank-import's `UnmatchedBucket` pattern); matched rows collapse into a
// single quiet summary line, never listed individually by default.
import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { EpfTransaction } from '@/core/db/types';
import type { EpfReconciliationItem } from '@/core/portfolio/epfReconciliation';
import type { ParsedEpfPassbookRow } from '@/core/portfolio/epfPassbookParser';
import { formatCurrency } from '@/lib/formatters';
import { Modal, Button, StatBox, DetailRow } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { EPF_TX_LABELS } from './epfTxLabels';
import { itemKey, type EpfUnitSelection } from './epfImportLogic';

function itemLabel(item: EpfReconciliationItem): string {
  if (item.wagesMonth) {
    const monthLabel = new Date(`${item.wagesMonth}-01T00:00:00`).toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric'
    });
    return `${monthLabel} · Contribution`;
  }
  return EPF_TX_LABELS[item.type];
}

/** The single "total to EPF" figure a row displays — contribution sums employee+employer; every other
 *  type has always used one combined figure (see `epfReconciliation.ts`'s own `existingAmounts()`). */
function importedTotal(item: EpfReconciliationItem): number {
  return item.type === 'contribution'
    ? item.imported.employeeAmount + item.imported.employerAmount
    : item.imported.employeeAmount;
}

function existingTotal(t: EpfTransaction): number {
  if (t.type === 'contribution') return (t.employeeAmount ?? 0) + (t.employerAmount ?? 0);
  if (t.employeeAmount != null || t.employerAmount != null) return (t.employeeAmount ?? 0) + (t.employerAmount ?? 0);
  return t.amount ?? 0;
}

interface EpfImportReviewSheetProps {
  title: string;
  fileChip?: string | undefined;
  items: EpfReconciliationItem[];
  /** Contribution rows for the current unit — looked up per item (by `wagesMonth`) to show the
   *  employee/employer/EPS breakdown popup on tap, reusing the same content shape
   *  `EpfAllTransactionsSheet`'s existing `selectedMonth` popup already shows. */
  rows: ParsedEpfPassbookRow[];
  confirmLabel: string;
  saving?: boolean;
  onConfirm: (selection: EpfUnitSelection) => void;
  onClose: () => void;
}

export function EpfImportReviewSheet({
  title,
  fileChip,
  items,
  rows,
  confirmLabel,
  saving,
  onConfirm,
  onClose
}: EpfImportReviewSheetProps) {
  const theme = useThemeColors();
  const rowsByMonth = useMemo(() => new Map(rows.map((r) => [r.wagesMonth, r])), [rows]);

  const conflicts = useMemo(() => items.filter((i) => i.kind === 'conflict'), [items]);
  const newItems = useMemo(() => items.filter((i) => i.kind === 'new'), [items]);
  const matches = useMemo(() => items.filter((i) => i.kind === 'matches'), [items]);

  const [uncheckedKeys, setUncheckedKeys] = useState<Set<string>>(new Set());
  const [conflictChoices, setConflictChoices] = useState<Map<string, 'imported' | 'existing'>>(new Map());
  const [matchesExpanded, setMatchesExpanded] = useState(false);
  const [breakdownItem, setBreakdownItem] = useState<EpfReconciliationItem | null>(null);

  function toggleChecked(key: string) {
    setUncheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setConflictChoice(key: string, choice: 'imported' | 'existing') {
    setConflictChoices((prev) => new Map(prev).set(key, choice));
  }

  function handleConfirm() {
    const checkedKeys = new Set(newItems.map(itemKey).filter((k) => !uncheckedKeys.has(k)));
    onConfirm({ checkedKeys, conflictChoices });
  }

  const breakdownRow = breakdownItem?.wagesMonth ? rowsByMonth.get(breakdownItem.wagesMonth) : undefined;

  return (
    <>
      <Modal
        onClose={onClose}
        title="Review import"
        scrollable
        footer={
          <Button variant="primary" fullWidth onPress={handleConfirm} loading={saving} disabled={saving}>
            {confirmLabel}
          </Button>
        }
      >
        <View className="-mt-2 flex-row items-center justify-between gap-2">
          <Text className="text-[10px] text-tertiary flex-1" numberOfLines={1}>
            {title}
          </Text>
          {fileChip && (
            <Text
              className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: tint('#64748b', 15), color: '#64748b' }}
            >
              {fileChip}
            </Text>
          )}
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <StatBox size="sm" label="New" value={newItems.length} valueColor={theme.info} />
          </View>
          <View className="flex-1">
            <StatBox size="sm" label="Matched" value={matches.length} valueColor={theme.success} />
          </View>
          <View className="flex-1">
            <StatBox
              size="sm"
              label="Conflict"
              value={conflicts.length}
              valueColor={conflicts.length > 0 ? theme.warning : undefined}
            />
          </View>
        </View>

        {conflicts.length > 0 && (
          <View className="gap-2">
            <Text
              className="text-[9.5px] font-extrabold uppercase tracking-wide px-0.5"
              style={{ color: theme.warning }}
            >
              Needs your decision
            </Text>
            {conflicts.map((item) => {
              const key = itemKey(item);
              const choice = conflictChoices.get(key) ?? 'imported';
              return (
                <View
                  key={key}
                  className="rounded-2xl p-2.5 gap-2 border"
                  style={{ backgroundColor: tint(theme.warning, 10), borderColor: tint(theme.warning, 35) }}
                >
                  <View className="flex-row items-center gap-1.5">
                    <Icon name="ti-alert-triangle" size={13} color={theme.warning} />
                    <Text className="text-xs font-bold text-primary flex-1" numberOfLines={1}>
                      {itemLabel(item)}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    {(['imported', 'existing'] as const).map((side) => {
                      const selected = choice === side;
                      const value =
                        side === 'imported' ? importedTotal(item) : item.existing ? existingTotal(item.existing) : 0;
                      return (
                        <Pressable
                          key={side}
                          onPress={() => setConflictChoice(key, side)}
                          className="flex-1 rounded-xl p-2 border"
                          style={{
                            backgroundColor: selected ? '#fff7e8' : theme.surface,
                            borderColor: selected ? theme.warning : theme.border
                          }}
                        >
                          <Text
                            className="text-[8px] font-bold uppercase tracking-wide"
                            style={{ color: selected ? '#b1650a' : theme.textTertiary }}
                          >
                            {side === 'imported' ? 'Imported (passbook)' : 'Existing (Penny)'}
                          </Text>
                          <Text className="text-xs font-extrabold text-primary mt-0.5 tabular-nums">
                            {formatCurrency(value)}
                          </Text>
                          <View className="flex-row items-center gap-1 mt-1">
                            <View
                              className="w-2.5 h-2.5 rounded-full border"
                              style={{
                                borderColor: selected ? theme.warning : theme.textTertiary,
                                backgroundColor: selected ? theme.warning : 'transparent'
                              }}
                            />
                            <Text
                              className="text-[8.5px] font-semibold"
                              style={{ color: selected ? '#b1650a' : theme.textTertiary }}
                            >
                              {side === 'imported' ? 'Use this — default' : 'Keep this instead'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {newItems.length > 0 && (
          <View className="gap-0.5">
            <Text className="text-[9.5px] font-extrabold uppercase tracking-wide px-0.5" style={{ color: theme.info }}>
              New — will be added
            </Text>
            {newItems.map((item) => {
              const key = itemKey(item);
              const checked = !uncheckedKeys.has(key);
              const tappable = item.type === 'contribution';
              return (
                <Pressable
                  key={key}
                  onPress={() => (tappable ? setBreakdownItem(item) : toggleChecked(key))}
                  className="flex-row items-center gap-2.5 py-2 border-b border-dashed border-theme"
                >
                  <Pressable
                    onPress={() => toggleChecked(key)}
                    hitSlop={8}
                    className="w-4 h-4 rounded items-center justify-center border shrink-0"
                    style={{
                      borderColor: checked ? theme.info : theme.border,
                      backgroundColor: checked ? theme.info : 'transparent'
                    }}
                  >
                    {checked && <Icon name="ti-check" size={10} color="#fff" />}
                  </Pressable>
                  <Text className="text-xs font-medium text-primary flex-1" numberOfLines={1}>
                    {itemLabel(item)}
                  </Text>
                  <Text className="text-xs font-semibold text-primary tabular-nums">
                    {formatCurrency(importedTotal(item))}
                  </Text>
                  {tappable && <Icon name="ti-chevron-right" size={12} color={theme.textTertiary} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {matches.length > 0 && (
          <View>
            <Pressable
              onPress={() => setMatchesExpanded((v) => !v)}
              className="flex-row items-center gap-1.5 py-2 border-t border-theme"
            >
              <Icon name="ti-circle-check" size={14} color={theme.success} />
              <Text className="text-[10.5px] text-secondary flex-1">
                {matches.length} already matched — nothing to review
              </Text>
              <Text className="text-[9.5px] font-bold" style={{ color: '#64748b' }}>
                {matchesExpanded ? 'Hide' : 'View'}
              </Text>
            </Pressable>
            {matchesExpanded && (
              <View className="gap-1 pb-1">
                {matches.map((item) => (
                  <View key={itemKey(item)} className="flex-row items-center justify-between px-1 py-1">
                    <Text className="text-[10.5px] text-tertiary">{itemLabel(item)}</Text>
                    <Text className="text-[10.5px] text-tertiary tabular-nums">
                      {formatCurrency(importedTotal(item))}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {items.length === 0 && (
          <Text className="text-center text-sm text-tertiary py-6">Nothing in this statement to review.</Text>
        )}
      </Modal>

      {breakdownItem && (
        <Modal onClose={() => setBreakdownItem(null)} title={itemLabel(breakdownItem)} size="sm">
          <View className="-mt-2">
            <Text className="text-[10px] text-tertiary">{breakdownItem.sourceParticulars}</Text>
          </View>
          <DetailRow
            label="Employee contribution"
            value={formatCurrency(breakdownItem.imported.employeeAmount)}
            size="md"
          />
          <DetailRow label="Employer → EPF" value={formatCurrency(breakdownItem.imported.employerAmount)} size="md" />
          <DetailRow
            label={<Text style={{ color: theme.textTertiary }}>Employer → EPS (pension)</Text>}
            value={
              <Text style={{ color: theme.textTertiary }}>{formatCurrency(breakdownItem.imported.pensionAmount)}</Text>
            }
            size="md"
          />
          {breakdownRow && (breakdownRow.epfWages > 0 || breakdownRow.epsWages > 0) && (
            <>
              <View className="border-t border-theme" />
              <DetailRow label="EPF wages" value={formatCurrency(breakdownRow.epfWages)} size="md" />
              <DetailRow label="EPS wages" value={formatCurrency(breakdownRow.epsWages)} size="md" />
            </>
          )}
        </Modal>
      )}
    </>
  );
}
