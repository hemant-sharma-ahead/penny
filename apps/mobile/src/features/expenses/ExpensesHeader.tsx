import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Modal, Button, PageHeader } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { usePrivacy } from '~/context/PrivacyContext';
import { useEventMode } from '~/context/EventModeContext';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { monthLabel } from '@/lib/date';
import { useForecast } from '~/hooks/useForecast';
import { useThemeColors } from '~/theme/useThemeColors';
import { EventsModal } from './events/EventsModal';
import { useEventEditor } from './events/useEventEditor';
import { ExpenseExportModal } from './transactions/ExpenseExportModal';

interface ExpensesHeaderProps {
  filteredTotal: number;
  monthFilter: string | null;
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  linkedCountByEventHashtag: Map<string, number>;
  saveExpense: (e: Expense) => Promise<void>;
}

/**
 * RN port of apps/web-react/src/features/expenses/ExpensesHeader.tsx. "Import expenses" now navigates
 * to the real `Import` screen (restored once the Import module was ported — see `~/features/import/`);
 * previously dropped as a no-op for lack of that destination.
 */
export function ExpensesHeader({
  filteredTotal,
  monthFilter,
  expenses,
  expenseCategories,
  linkedCountByEventHashtag,
  saveExpense
}: ExpensesHeaderProps) {
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { shouldMask } = usePrivacy();
  const masked = shouldMask(false);
  const { events, updateEvent } = useEventMode();
  const { loading: forecastLoading, forecast } = useForecast();
  const safeToSpend = Math.max(0, forecast.discretionary);
  const [nowMs] = useState(() => Date.now());
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const { unlinkDialog, closeUnlinkDialog, handleEditEventSave } = useEventEditor(expenses, saveExpense, updateEvent);

  const immersiveEvent = events.find((e) => e.subtype === 'immersive');

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <>
            <Pressable
              onPress={() => setShowEventSheet(true)}
              className="w-8 h-8 items-center justify-center rounded-lg"
              accessibilityLabel="Manage events"
            >
              <Icon name="ti-flag-3" size={18} color={theme.textSecondary} />
              {events.length > 0 && (
                <View
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: events[0]?.color ?? '#ef4444' }}
                />
              )}
            </Pressable>
            <Button
              variant="ghost"
              icon="ti-file-import"
              accessibilityLabel="Import expenses"
              className="w-8 h-8 rounded-lg"
              onPress={() => navigation.navigate('Import')}
            />
            <Button
              variant="ghost"
              icon="ti-file-export"
              accessibilityLabel="Export expenses"
              className="w-8 h-8 rounded-lg"
              onPress={() => setShowExportSheet(true)}
            />
          </>
        }
      >
        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-sm text-secondary">
            {monthFilter ? monthLabel(monthFilter) : 'All transactions'}:{' '}
            <Text className="font-medium text-primary">{masked ? '••••' : formatCurrency(filteredTotal)}</Text>
          </Text>
          <View className="flex-row items-center gap-2">
            {immersiveEvent && (
              <View className="flex-row items-center gap-1">
                <Icon name="ti-plane" size={11} color={immersiveEvent.color} />
                <Text className="text-[10px] font-semibold" style={{ color: immersiveEvent.color }}>
                  Vacation On · {immersiveEvent.name}
                </Text>
              </View>
            )}
            {!forecastLoading && (
              <Pressable
                onPress={() => navigation.navigate('Home', { screen: 'CashFlow' })}
                accessibilityLabel="View cash flow"
                className="flex-row items-center gap-1 rounded-full bg-surface-2 border border-theme px-2.5 py-1"
              >
                <Icon name="ti-wallet" size={12} color={theme.primary} />
                <Text className="text-[11px] font-medium text-secondary">
                  Safe: <Text className="text-primary">{masked ? '••••' : formatCurrency(safeToSpend)}</Text>
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </PageHeader>

      {showExportSheet && (
        <ExpenseExportModal
          expenses={expenses}
          expenseCategories={expenseCategories}
          onClose={() => setShowExportSheet(false)}
        />
      )}

      {showEventSheet && (
        <EventsModal
          onClose={() => setShowEventSheet(false)}
          linkedCountByEventHashtag={linkedCountByEventHashtag}
          nowMs={nowMs}
          onRequestEditSave={handleEditEventSave}
        />
      )}

      {unlinkDialog && (
        <Modal
          onClose={closeUnlinkDialog}
          footer={
            <View className="flex-col gap-2">
              <Button variant="primary" fullWidth onPress={unlinkDialog.onConfirmUnlink}>
                Confirm & Unlink
              </Button>
              <Button variant="secondary" fullWidth onPress={unlinkDialog.onConfirm}>
                Confirm, keep linked
              </Button>
              <Button variant="ghost" fullWidth onPress={closeUnlinkDialog}>
                Cancel
              </Button>
            </View>
          }
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${theme.warning}22` }}
            >
              <Icon name="ti-alert-triangle" size={20} color={theme.warning} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-primary">Date range changed</Text>
              <Text className="text-xs mt-0.5 text-tertiary">
                {unlinkDialog.outOfRangeCount} transaction
                {unlinkDialog.outOfRangeCount !== 1 ? 's fall' : ' falls'} outside the new date range.
              </Text>
            </View>
          </View>
          <Text className="text-xs leading-relaxed text-secondary mt-3">
            You can keep them linked to this event, or unlink them so they appear in regular analytics instead.
          </Text>
        </Modal>
      )}
    </>
  );
}
