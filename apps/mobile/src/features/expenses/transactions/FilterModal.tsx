import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory, Goal } from '@/core/db/types';
import type { ActiveEvent } from '~/context/EventModeContext';
import { MonthPickerModal } from './MonthPickerModal';
import { monthLabel } from '@/lib/date';
import { toMonthYearKey } from '@/lib/formatters';
import { buildParentCategoryMap, groupKey, groupMeta } from '@/core/expenses/categoryGroups';
import { resolveGoalIcon, getRiskColor } from '@/core/goals/meta';

type TxnTypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export interface FilterState {
  monthFilter: string | null;
  typeFilter: TxnTypeFilter;
  accountFilters: Set<string>;
  parentCategoryFilters: Set<string>;
  categoryFilters: Set<string>;
  eventFilters: Set<string>;
  goalFilters: Set<string>;
  /** 2026-08-06 — single boolean, not a multi-select set like the others above (there's only one thing
   *  to filter by: mismatched vs. not). See `useTransactionFilters.ts`'s doc comment. */
  paymentModeMismatchOnly: boolean;
}

interface FilterModalProps {
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  accounts: Account[];
  categories: ExpenseCategory[];
  goals: Goal[];
  /** Whether there's at least one payment-mode-mismatched transaction at all — the toggle below only
   *  renders when true, same "hide the section entirely rather than show a filter with zero possible
   *  results" convention already used for Event/Goal above. */
  hasPaymentModeMismatches: boolean;
  initial: FilterState;
  onApply: (filters: FilterState) => void;
  onClose: () => void;
}

export function FilterModal({
  events,
  pastEvents,
  accounts,
  categories,
  goals,
  hasPaymentModeMismatches,
  initial,
  onApply,
  onClose
}: FilterModalProps) {
  const theme = useThemeColors();
  const [monthFilter, setMonthFilter] = useState<string | null>(initial.monthFilter);
  const [typeFilter, setTypeFilter] = useState<TxnTypeFilter>(initial.typeFilter);
  const [accountFilters, setAccountFilters] = useState<Set<string>>(new Set(initial.accountFilters));
  const [parentCategoryFilters, setParentCategoryFilters] = useState<Set<string>>(
    new Set(initial.parentCategoryFilters)
  );
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set(initial.categoryFilters));
  const [eventFilters, setEventFilters] = useState<Set<string>>(new Set(initial.eventFilters));
  const [goalFilters, setGoalFilters] = useState<Set<string>>(new Set(initial.goalFilters));
  const [paymentModeMismatchOnly, setPaymentModeMismatchOnly] = useState(initial.paymentModeMismatchOnly);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Tile grid (Account/Category) auto-adjusts its column count to the actual available width instead of
  // a fixed 64px tile always yielding ~4 per row — a wider screen fits 5 or 6 comfortably. Measured once
  // (both grids share the same modal width) rather than a fixed-percentage width, which would just be a
  // different hardcoded count instead of a genuinely responsive one.
  const [gridWidth, setGridWidth] = useState(0);
  const GRID_GAP = 8;
  const MIN_TILE_WIDTH = 64;
  const MAX_TILE_COLUMNS = 6;
  const tileColumns =
    gridWidth > 0
      ? Math.min(MAX_TILE_COLUMNS, Math.max(4, Math.floor((gridWidth + GRID_GAP) / (MIN_TILE_WIDTH + GRID_GAP))))
      : 4;
  const tileWidth = gridWidth > 0 ? (gridWidth - GRID_GAP * (tileColumns - 1)) / tileColumns : MIN_TILE_WIDTH;

  function handleDone() {
    onApply({
      monthFilter,
      typeFilter,
      accountFilters,
      parentCategoryFilters,
      categoryFilters,
      eventFilters,
      goalFilters,
      paymentModeMismatchOnly
    });
    onClose();
  }

  function handleClear() {
    setMonthFilter(null);
    setTypeFilter('all');
    setAccountFilters(new Set());
    setParentCategoryFilters(new Set());
    setCategoryFilters(new Set());
    setEventFilters(new Set());
    setGoalFilters(new Set());
    setPaymentModeMismatchOnly(false);
  }

  const parentCategoryMap = buildParentCategoryMap(categories);
  const leafCategories = categories.filter((c) => !c.isGroup);

  const applicableGroups =
    typeFilter !== 'all'
      ? new Set(leafCategories.filter((c) => (c.applicableTo ?? 'expense') === typeFilter).map((c) => groupKey(c)))
      : null;

  const allGroups = [...new Set(leafCategories.map((c) => groupKey(c)))].map((key) => ({
    key,
    label: groupMeta(key, parentCategoryMap).label
  }));

  const visibleCategories =
    parentCategoryFilters.size > 0
      ? leafCategories.filter((c) => parentCategoryFilters.has(groupKey(c)))
      : leafCategories;

  const typeColors: Record<string, string> = {
    all: theme.primary,
    expense: theme.danger,
    income: theme.success,
    transfer: theme.info
  };

  const chip = (
    isSelected: boolean,
    label: string,
    onPress: () => void,
    opts?: { dotColor?: string; icon?: string; iconColor?: string; disabled?: boolean; key?: string }
  ) => (
    <Pressable
      key={opts?.key ?? label}
      onPress={onPress}
      disabled={opts?.disabled}
      className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl"
      style={{
        backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary,
        borderWidth: isSelected ? 0 : 0.5,
        borderColor: theme.border,
        opacity: opts?.disabled ? 0.4 : 1
      }}
    >
      {opts?.dotColor && (
        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? '#fff' : opts.dotColor }} />
      )}
      {opts?.icon && (
        <Icon name={opts.icon} size={13} color={isSelected ? '#fff' : (opts.iconColor ?? theme.textSecondary)} />
      )}
      <Text className="text-xs font-medium" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );

  const tile = (
    isSelected: boolean,
    icon: string,
    color: string,
    label: string,
    onPress: () => void,
    key: string,
    iconSize = 18
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      className="items-center gap-1 p-2 rounded-xl border-2"
      style={{
        width: tileWidth,
        borderColor: isSelected ? color : 'transparent',
        backgroundColor: theme.surfaceSecondary
      }}
    >
      <Icon name={icon} size={iconSize} color={isSelected ? color : theme.textTertiary} />
      <Text
        className="text-[9px] font-medium text-center"
        numberOfLines={2}
        style={{ color: isSelected ? color : theme.textSecondary }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <>
      <Modal
        onClose={onClose}
        title="Filters"
        scrollable
        footer={
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="secondary" fullWidth onPress={handleClear}>
                Clear filters
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="primary" fullWidth onPress={handleDone}>
                Done
              </Button>
            </View>
          </View>
        }
      >
        {/* Month */}
        <View>
          <Text className="text-xs font-medium text-secondary mb-2">Month</Text>
          <Pressable
            onPress={() => setShowMonthPicker(true)}
            className="w-full flex-row items-center gap-2 px-4 py-2.5 rounded-xl border border-theme bg-surface-2"
          >
            <Icon name="ti-calendar" size={15} color={theme.textTertiary} />
            <Text className="flex-1 text-sm font-medium text-primary">
              {monthFilter ? monthLabel(monthFilter) : 'All months'}
            </Text>
            <Icon name="ti-chevron-right" size={14} color={theme.textTertiary} />
          </Pressable>
        </View>

        {/* Type */}
        <View>
          <Text className="text-xs font-medium text-secondary mb-2">Type</Text>
          <View className="flex-row flex-wrap gap-2">
            {(['all', 'expense', 'income', 'transfer'] as const).map((t) => {
              const isSelected = typeFilter === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTypeFilter(t)}
                  className="py-2 rounded-xl items-center"
                  style={{
                    width: '23%',
                    backgroundColor: isSelected ? typeColors[t] : theme.surfaceSecondary,
                    borderWidth: isSelected ? 0 : 0.5,
                    borderColor: theme.border
                  }}
                >
                  <Text className="text-xs font-medium" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
                    {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Payment mode mismatch (2026-08-06) — a single toggle, not a multi-select set, and only
            shown at all when there's at least one flagged transaction (same "hide the section
            entirely rather than show a filter for zero results" convention Event/Goal already use). */}
        {hasPaymentModeMismatches && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-2">Data quality</Text>
            <View className="flex-row flex-wrap gap-2">
              {chip(
                paymentModeMismatchOnly,
                'Payment mode mismatch only',
                () => setPaymentModeMismatchOnly((v) => !v),
                { icon: 'ti-alert-triangle', iconColor: theme.warning, key: 'payment-mode-mismatch' }
              )}
            </View>
          </View>
        )}

        {/* Event */}
        {[...events, ...pastEvents].length > 0 && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-2">Event</Text>
            <View className="flex-row flex-wrap gap-2">
              {chip(eventFilters.size === 0, 'All events', () => setEventFilters(new Set()), {
                key: 'all-events'
              })}
              {[...events, ...pastEvents].map((ev) =>
                chip(
                  eventFilters.has(ev.hashtag),
                  ev.name,
                  () =>
                    setEventFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(ev.hashtag)) next.delete(ev.hashtag);
                      else next.add(ev.hashtag);
                      return next;
                    }),
                  { dotColor: ev.color, key: ev.id }
                )
              )}
            </View>
          </View>
        )}

        {/* Goal */}
        {goals.length > 0 && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-2">Goal</Text>
            <View className="flex-row flex-wrap gap-2">
              {chip(goalFilters.size === 0, 'All goals', () => setGoalFilters(new Set()), {
                key: 'all-goals'
              })}
              {goals.map((g) =>
                chip(
                  goalFilters.has(g.id),
                  g.name,
                  () =>
                    setGoalFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      return next;
                    }),
                  { icon: resolveGoalIcon(g), iconColor: getRiskColor(g.risk), key: g.id }
                )
              )}
            </View>
          </View>
        )}

        {/* Account */}
        {accounts.filter((a) => !a.isArchived).length > 0 && (
          <View>
            <Text className="text-xs font-medium text-secondary mb-2">Account</Text>
            <View className="flex-row flex-wrap gap-2">
              {tile(
                accountFilters.size === 0,
                'ti-layout-grid',
                theme.primary,
                'All',
                () => setAccountFilters(new Set()),
                'all-accounts'
              )}
              {accounts
                .filter((a) => !a.isArchived)
                .map((acc) =>
                  tile(
                    accountFilters.has(acc.id),
                    acc.icon,
                    acc.color,
                    acc.name,
                    () =>
                      setAccountFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(acc.id)) next.delete(acc.id);
                        else next.add(acc.id);
                        return next;
                      }),
                    acc.id
                  )
                )}
            </View>
          </View>
        )}

        {/* Category group */}
        <View>
          <Text className="text-xs font-medium text-secondary mb-2">Category group</Text>
          <View className="flex-row flex-wrap gap-2">
            {chip(
              parentCategoryFilters.size === 0,
              'All',
              () => {
                setParentCategoryFilters(new Set());
                setCategoryFilters(new Set());
              },
              { key: 'all-groups' }
            )}
            {allGroups.map(({ key, label }) => {
              const isApplicable = applicableGroups === null || applicableGroups.has(key);
              const isSelected = parentCategoryFilters.has(key);
              return chip(
                isSelected,
                label,
                () => {
                  if (!isApplicable) return;
                  setParentCategoryFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                  setCategoryFilters(new Set());
                },
                { disabled: !isApplicable, key }
              );
            })}
          </View>
        </View>

        {/* Category */}
        <View>
          <Text className="text-xs font-medium text-secondary mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2" onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {tile(
              categoryFilters.size === 0,
              'ti-layout-grid',
              theme.primary,
              'All',
              () => setCategoryFilters(new Set()),
              'all-categories',
              16
            )}
            {visibleCategories.map((cat) =>
              tile(
                categoryFilters.has(cat.id),
                cat.icon,
                cat.color,
                cat.name,
                () =>
                  setCategoryFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat.id)) next.delete(cat.id);
                    else next.add(cat.id);
                    return next;
                  }),
                cat.id,
                16
              )
            )}
          </View>
        </View>
      </Modal>

      {showMonthPicker && (
        <MonthPickerModal
          value={monthFilter ?? toMonthYearKey()}
          onSelect={(m) => {
            setMonthFilter(m);
            setShowMonthPicker(false);
          }}
          onClose={() => setShowMonthPicker(false)}
          maxMonth={toMonthYearKey()}
        />
      )}
    </>
  );
}
