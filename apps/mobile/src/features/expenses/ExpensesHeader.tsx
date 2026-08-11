import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Modal, Button, PageHeader } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { usePrivacy } from '~/context/PrivacyContext';
import { useEventMode } from '~/context/EventModeContext';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { useForecast } from '~/hooks/useForecast';
import { useThemeColors } from '~/theme/useThemeColors';
import { EventsModal } from './events/EventsModal';
import { useEventEditor } from './events/useEventEditor';
import { ExpenseExportModal } from './transactions/ExpenseExportModal';
import { tint } from '~/lib/color';

interface ExpensesHeaderProps {
  filteredTotal: number;
  /** Count of transactions the current filter set resolves to (drives the "N transactions" label). */
  transactionCount: number;
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  linkedCountByEventHashtag: Map<string, number>;
  saveExpense: (e: Expense) => Promise<void>;
  /** Powers the account-verification banner below the header row (2026-08-11,
   *  `docs/mockups/proposals/expenses-account-verification-badge-v2.html`) — empty when every account
   *  is either verified or not `CHECKPOINT_ELIGIBLE`, in which case the banner renders nothing at all
   *  (pixel-identical to before this feature existed). */
  accountsNeedingAttention: Account[];
}

/**
 * RN port of apps/web-react/src/features/expenses/ExpensesHeader.tsx. "Import expenses" now navigates
 * to the real `Import` screen (restored once the Import module was ported — see `~/features/import/`);
 * previously dropped as a no-op for lack of that destination.
 */
export function ExpensesHeader({
  filteredTotal,
  transactionCount,
  expenses,
  expenseCategories,
  linkedCountByEventHashtag,
  saveExpense,
  accountsNeedingAttention
}: ExpensesHeaderProps) {
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { shouldMask } = usePrivacy();
  const masked = shouldMask(false);
  const { events, updateEvent } = useEventMode();
  const { loading: forecastLoading, safeToSpend } = useForecast();
  const [nowMs] = useState(() => Date.now());
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const { unlinkDialog, closeUnlinkDialog, handleEditEventSave } = useEventEditor(expenses, saveExpense, updateEvent);

  const immersiveEvent = events.find((e) => e.subtype === 'immersive');

  return (
    <>
      <PageHeader>
        {/* Left: transaction count + amount. Centre: the active event, if any — a third equal-width
            flex column (not absolute positioning) so it's genuinely centred over the whole row on both
            axes without the on-device absolute+inset centering bug MainTabs.tsx's HeaderCenter already
            hit once (see its own doc comment). Right: the 3 action icons stacked above the Safe pill. */}
        <View className="flex-row items-center justify-between mt-1" style={{ minHeight: 52 }}>
          <View className="flex-1 items-start">
            <Text className="text-[11px] font-medium text-tertiary">
              {transactionCount} transaction{transactionCount === 1 ? '' : 's'}
            </Text>
            <Text className="text-lg font-bold text-primary mt-0.5">
              {masked ? '••••' : formatCurrency(filteredTotal)}
            </Text>
          </View>

          <View className="flex-1 items-center">
            {immersiveEvent && (
              <View
                className="flex-row items-center gap-1 rounded-full border px-2.5 py-1"
                style={{
                  backgroundColor: tint(immersiveEvent.color, 12),
                  borderColor: tint(immersiveEvent.color, 30)
                }}
              >
                <Icon name="ti-plane" size={11} color={immersiveEvent.color} />
                <Text className="text-[10px] font-semibold" numberOfLines={1} style={{ color: immersiveEvent.color }}>
                  Vacation On · {immersiveEvent.name}
                </Text>
              </View>
            )}
          </View>

          <View className="flex-1 items-end gap-2">
            <View className="flex-row items-center gap-0.5">
              <Pressable
                onPress={() => setShowEventSheet(true)}
                className="w-7 h-7 items-center justify-center rounded-lg"
                accessibilityLabel="Manage events"
              >
                <Icon name="ti-flag-3" size={14} color={theme.textSecondary} />
                {events.length > 0 && (
                  <View
                    className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: events[0]?.color ?? '#ef4444' }}
                  />
                )}
              </Pressable>
              <Button
                variant="ghost"
                icon="ti-download"
                accessibilityLabel="Import expenses"
                className="w-7 h-7 rounded-lg"
                onPress={() => navigation.navigate('Import')}
              />
              <Button
                variant="ghost"
                icon="ti-upload"
                accessibilityLabel="Export expenses"
                className="w-7 h-7 rounded-lg"
                onPress={() => setShowExportSheet(true)}
              />
            </View>
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

        {accountsNeedingAttention.length > 0 && (
          <Pressable
            onPress={() => navigation.navigate('Home', { screen: 'Accounts' })}
            className="flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 mt-2.5"
            style={{ backgroundColor: tint(theme.danger, 13), borderColor: tint(theme.danger, 35) }}
            accessibilityLabel="Account verification issue, tap to review"
          >
            <Icon name="ti-alert-triangle" size={16} color={theme.danger} />
            <View className="flex-1">
              <Text className="text-xs font-bold" style={{ color: theme.danger }}>
                {accountsNeedingAttention.length === 1
                  ? '1 account needs attention'
                  : `${accountsNeedingAttention.length} accounts need attention`}
              </Text>
              <Text className="text-[10.5px] text-secondary mt-0.5">
                {accountsNeedingAttention.length === 1
                  ? `${accountsNeedingAttention[0]?.name} · balance may not match your bank`
                  : 'Tap to review in Accounts'}
              </Text>
            </View>
            <Icon name="ti-chevron-right" size={14} color={theme.danger} />
          </Pressable>
        )}
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
              style={{ backgroundColor: tint(theme.warning, 13) }}
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
          <Text className="text-xs leading-relaxed text-secondary">
            You can keep them linked to this event, or unlink them so they appear in regular analytics instead.
          </Text>
        </Modal>
      )}
    </>
  );
}
