import { useState } from 'react';
import { View, Pressable, TextInput as RNTextInput, Text } from 'react-native';
import { Modal, Button, DateInput, FormField } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { exportExpensesAsCsv, downloadProtectedZip } from '@/core/export/exportCsv';

interface ExpenseExportModalProps {
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  onClose: () => void;
}

const RANGES = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_3', label: 'Last 3 months' },
  { value: 'all_time', label: 'All time' },
  { value: 'custom', label: 'Custom range' }
] as const;

export function ExpenseExportModal({ expenses, expenseCategories, onClose }: ExpenseExportModalProps) {
  const theme = useThemeColors();
  const [exportRange, setExportRange] = useState<'this_month' | 'last_3' | 'all_time' | 'custom'>('this_month');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exporting, setExporting] = useState(false);

  // `downloadProtectedZip` is async on native (writes to expo-file-system's cache dir + hands off to
  // expo-sharing's native share sheet, vs. web's synchronous Blob/`<a download>` click) — must be awaited.
  async function handleExport() {
    if (!exportPassword) return;
    setExporting(true);
    try {
      const now = Date.now();
      let startMs = 0;
      let endMs = now;
      let label = 'all-time';
      if (exportRange === 'this_month') {
        startMs = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        label = 'this-month';
      } else if (exportRange === 'last_3') {
        startMs = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).getTime();
        label = 'last-3-months';
      } else if (exportRange === 'custom') {
        startMs = exportFrom ? new Date(exportFrom).getTime() : 0;
        endMs = exportTo ? new Date(exportTo + 'T23:59:59').getTime() : now;
        label = exportFrom && exportTo ? `${exportFrom}-to-${exportTo}` : 'custom';
      }
      const filtered = expenses.filter((e) => e.date >= startMs && e.date <= endMs);
      const csv = exportExpensesAsCsv(filtered, expenseCategories);
      await downloadProtectedZip(csv, `penny-expenses-${label}.zip`, exportPassword);
      setExportPassword('');
      onClose();
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Export Expenses" size="sm">
      <View className="gap-2">
        {RANGES.map(({ value, label }) => {
          const isSelected = exportRange === value;
          return (
            <Pressable
              key={value}
              onPress={() => setExportRange(value)}
              className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl border"
              style={{
                borderColor: isSelected ? theme.primary : theme.border,
                backgroundColor: isSelected ? `${theme.primary}15` : 'transparent'
              }}
            >
              <View
                className="w-4 h-4 rounded-full border-2 items-center justify-center"
                style={{ borderColor: isSelected ? theme.primary : theme.border }}
              >
                {isSelected && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary }} />}
              </View>
              <Text className="text-sm font-medium text-primary">{label}</Text>
            </Pressable>
          );
        })}
        {exportRange === 'custom' && (
          <View className="flex-row gap-2 pt-1">
            <View className="flex-1">
              <DateInput label="From" value={exportFrom} onChange={setExportFrom} />
            </View>
            <View className="flex-1">
              <DateInput label="To" value={exportTo} onChange={setExportTo} />
            </View>
          </View>
        )}
      </View>

      <FormField
        label="Export password"
        hint="The ZIP is AES-256 encrypted. This password cannot be recovered — keep it safe."
      >
        <View className="relative flex-row items-center">
          <RNTextInput
            value={exportPassword}
            onChangeText={setExportPassword}
            secureTextEntry={!showExportPassword}
            placeholder="Set a password for the ZIP file"
            placeholderTextColor={theme.textTertiary}
            className="bg-surface-2 text-primary border border-theme w-full rounded-xl px-3 py-2.5 text-sm pr-10"
          />
          <Pressable
            onPress={() => setShowExportPassword((v) => !v)}
            className="absolute right-3"
            accessibilityLabel={showExportPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name={showExportPassword ? 'ti-eye-off' : 'ti-eye'} size={16} color={theme.textTertiary} />
          </Pressable>
        </View>
      </FormField>

      <Button
        variant="primary"
        fullWidth
        loading={exporting}
        disabled={!exportPassword || exporting || (exportRange === 'custom' && (!exportFrom || !exportTo))}
        onPress={() => void handleExport()}
      >
        {exporting ? 'Creating ZIP…' : 'Download protected ZIP'}
      </Button>
    </Modal>
  );
}
