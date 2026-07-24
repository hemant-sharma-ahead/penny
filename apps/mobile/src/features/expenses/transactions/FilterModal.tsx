import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Modal, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory } from '@/core/db/types';
import type { ActiveEvent } from '~/context/EventModeContext';
import { MonthPickerModal } from './MonthPickerModal';
import { monthLabel } from '@/lib/date';
import { toMonthYearKey } from '@/lib/formatters';
import { buildParentCategoryMap, groupKey, groupMeta } from '@/core/expenses/categoryGroups';

type TxnTypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export interface FilterState {
  monthFilter: string | null;
  typeFilter: TxnTypeFilter;
  accountFilters: Set<string>;
  parentCategoryFilters: Set<string>;
  categoryFilters: Set<string>;
  eventFilters: Set<string>;
}

interface FilterModalProps {
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  accounts: Account[];
  categories: ExpenseCategory[];
  initial: FilterState;
  onApply: (filters: FilterState) => void;
  onClose: () => void;
}

export function FilterModal({ events, pastEvents, accounts, categories, initial, onApply, onClose }: FilterModalProps) {
  const theme = useThemeColors();
  const [monthFilter, setMonthFilter] = useState<string | null>(initial.monthFilter);
  const [typeFilter, setTypeFilter] = useState<TxnTypeFilter>(initial.typeFilter);
  const [accountFilters, setAccountFilters] = useState<Set<string>>(new Set(initial.accountFilters));
  const [parentCategoryFilters, setParentCategoryFilters] = useState<Set<string>>(
    new Set(initial.parentCategoryFilters)
  );
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set(initial.categoryFilters));
  const [eventFilters, setEventFilters] = useState<Set<string>>(new Set(initial.eventFilters));
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  function handleDone() {
    onApply({ monthFilter, typeFilter, accountFilters, parentCategoryFilters, categoryFilters, eventFilters });
    onClose();
  }

  function handleClear() {
    setMonthFilter(null);
    setTypeFilter('all');
    setAccountFilters(new Set());
    setParentCategoryFilters(new Set());
    setCategoryFilters(new Set());
    setEventFilters(new Set());
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
    opts?: { dotColor?: string; disabled?: boolean; key?: string }
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
        width: 64,
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
            <Button variant="secondary" fullWidth onPress={handleClear}>
              Clear filters
            </Button>
            <Button variant="primary" fullWidth onPress={handleDone}>
              Done
            </Button>
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
          <View className="flex-row flex-wrap gap-2">
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
