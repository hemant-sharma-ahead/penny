import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BANK_PRESETS } from '@/core/bank-import/presets';
import { useBankCashWithdrawalCodes } from '~/hooks/useBankCashWithdrawalCodes';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ListContainer,
  Modal,
  SectionLabel,
  SelectInput,
  TextInput
} from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

const ANY_BANK = 'any';

const BANK_OPTIONS = [
  { value: ANY_BANK, label: 'Any bank' },
  ...BANK_PRESETS.map((p) => ({ value: p.id, label: p.label }))
];

const BANK_LABELS: Record<string, string> = {
  [ANY_BANK]: 'Any bank',
  ...Object.fromEntries(BANK_PRESETS.map((p) => [p.id, p.label]))
};

/**
 * Cash-withdrawal narration code management (docs/plans/bank-statement-import.md's transfer-marking
 * work, 2026-08-05) — reachable from the same Accounts-page header entry point as "Merchant
 * recognition" (`BankImportOverridesPage.tsx`), since both are global, not-scoped-to-any-one-account
 * bank-import configuration. Grouped by bank (the codes genuinely differ — Kotak's own-ATM/other-ATM
 * pair is ATW/ATL, HDFC's is ATW/NWD) plus an "Any bank" group for codes that apply everywhere (NFS,
 * SELF, ...). Every row shown here — including the researched defaults — is fully editable/deletable:
 * this list is a well-researched starting point, not a guarantee (see `cashWithdrawalCodes.ts`'s doc
 * comment for per-entry confidence notes), so a wrong or missing code should be just as fixable as a
 * custom one.
 *
 * "Add code" is a FAB + popup (2026-08-05, matching the Expenses tab's own add-transaction FAB),
 * not an inline form pinned to the bottom of the list — consistency with the rest of the app's
 * add-a-thing pattern, per direct user feedback.
 */
export function BankCashWithdrawalCodesPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  useDefaultHeaderBack('BankCashWithdrawalCodes');
  const { codes, save, remove } = useBankCashWithdrawalCodes();

  const [showAdd, setShowAdd] = useState(false);
  const [bankId, setBankId] = useState<string>(ANY_BANK);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canAdd = code.trim().length > 0 && label.trim().length > 0;

  const grouped = useMemo(() => {
    const order = [ANY_BANK, ...BANK_PRESETS.map((p) => p.id)];
    return order
      .map((id) => ({ id, label: BANK_LABELS[id] ?? id, rows: codes.filter((c) => c.bankId === id) }))
      .filter((g) => g.rows.length > 0);
  }, [codes]);

  async function handleAdd() {
    if (!canAdd) return;
    const now = Date.now();
    await save({
      id: crypto.randomUUID(),
      bankId,
      code: code.trim().toUpperCase(),
      label: label.trim(),
      isDefault: false,
      createdAt: now,
      updatedAt: now
    });
    setBankId(ANY_BANK);
    setCode('');
    setLabel('');
    setShowAdd(false);
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Cash-withdrawal codes</Text>
        <Text className="text-xs text-tertiary mt-0.5">
          A statement line whose narration matches one of these is auto-marked as a transfer to your cash account
          instead of a plain expense.
        </Text>
      </View>

      <ScrollView className="flex-1">
        <View className="px-4 py-4 gap-4">
          {grouped.length === 0 ? (
            <Card>
              <EmptyState icon="ti-cash" title="No codes yet" description="Add one below to get started." />
            </Card>
          ) : (
            grouped.map((group) => (
              <View key={group.id} className="gap-2">
                <SectionLabel>{group.label}</SectionLabel>
                <ListContainer>
                  {group.rows.map((c) => (
                    <View key={c.id} className="flex-row items-center gap-2 px-4 py-3">
                      <Text className="text-xs text-tertiary font-mono" style={{ minWidth: 64 }} numberOfLines={1}>
                        {c.code}
                      </Text>
                      <Text className="text-sm text-primary flex-1" numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Button
                        variant="ghost"
                        icon="ti-trash"
                        accessibilityLabel="Delete code"
                        className="w-7 h-7 rounded-lg"
                        onPress={() => setDeletingId(c.id)}
                      />
                    </View>
                  ))}
                </ListContainer>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB — same placement/style as the Expenses tab's add-transaction FAB. */}
      <View className="absolute" style={{ bottom: insets.bottom + 16, right: 16 }}>
        <Pressable
          onPress={() => setShowAdd(true)}
          className="w-14 h-14 rounded-full shadow-lg items-center justify-center"
          style={{ backgroundColor: theme.primary }}
          accessibilityLabel="Add code"
        >
          <Icon name="ti-plus" size={24} color="#fff" />
        </Pressable>
      </View>

      {showAdd && (
        <Modal
          onClose={() => setShowAdd(false)}
          title="Add code"
          footer={
            <Button variant="primary" fullWidth disabled={!canAdd} onPress={() => void handleAdd()}>
              Add code
            </Button>
          }
        >
          <View className="gap-3">
            <SelectInput label="Bank" value={bankId} onChange={setBankId} options={BANK_OPTIONS} />
            <TextInput label="Code" value={code} onChange={setCode} placeholder="e.g. ATW" />
            <TextInput label="Meaning" value={label} onChange={setLabel} placeholder="e.g. Own-bank ATM withdrawal" />
          </View>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) void remove(deletingId);
          setDeletingId(null);
        }}
        title="Delete code?"
        message="Future statement lines matching this code will no longer be auto-marked as a cash-withdrawal transfer."
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </SafeAreaView>
  );
}
