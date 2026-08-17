import { useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { bankNarrationOverridesRepo } from '@/core/db/repositories';
import { CONNECTOR_KEYWORDS_LIST } from '@/core/bank-import/normalization';
import { useRepository } from '@/hooks/useRepository';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { Button, Card, ConfirmDialog, EmptyState, ListContainer, Modal, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

/**
 * Global normalization-override management screen (docs/plans/bank-statement-import.md §9a, mockup
 * `#s9`) — reachable from the Accounts page header, not scoped to any one account (merchant memory
 * spans every account). Manual overrides always win over the automatic keyword-stripping heuristic
 * (`core/bank-import/normalization.ts`'s `normalizeNarration`), keyed on a stable keyword/substring
 * the user types directly rather than a full raw line (reference numbers change every transaction).
 * The mockup's illustrative "auto" rows were flavor only, with no real backing data — this is just the
 * real custom-override CRUD list + add form.
 *
 * "Add override" is a FAB + popup (2026-08-05, matching the Expenses tab's own add-transaction FAB
 * and `BankCashWithdrawalCodesPage`'s equivalent), not an inline form pinned to the bottom of the
 * list — consistency with the rest of the app's add-a-thing pattern, per direct user feedback.
 */
export function BankImportOverridesPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  useDefaultHeaderBack('BankImportOverrides');
  const { items: overrides, save, remove, reload } = useRepository(bankNarrationOverridesRepo);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const [showAdd, setShowAdd] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [normalizesTo, setNormalizesTo] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const canAdd = keyword.trim().length > 0 && normalizesTo.trim().length > 0;

  async function handleAdd() {
    if (!canAdd) return;
    const now = Date.now();
    await save({
      id: crypto.randomUUID(),
      keyword: keyword.trim(),
      normalizedKey: normalizesTo.trim().toUpperCase(),
      createdAt: now,
      updatedAt: now
    });
    setKeyword('');
    setNormalizesTo('');
    setShowAdd(false);
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <View className="px-4 pt-3 pb-2 border-b border-theme">
        <Text className="text-sm font-semibold text-primary">Merchant recognition</Text>
        <Text className="text-xs text-tertiary mt-0.5">Custom overrides always win over the automatic guess.</Text>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View className="px-4 py-4 gap-4">
          {/* Read-only view of the fixed heuristic — the overrides list below is the only *editable*
              surface here; this is purely explanatory so the automatic guess isn't a total black box
              next to it. */}
          <View className="bg-surface border border-theme rounded-2xl overflow-hidden">
            <Pressable onPress={() => setShowHowItWorks((v) => !v)} className="flex-row items-center gap-2 px-4 py-3">
              <Icon name="ti-info-circle" size={16} color={theme.textSecondary} />
              <Text className="text-sm font-semibold text-primary flex-1">How automatic recognition works</Text>
              <Icon name={showHowItWorks ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
            </Pressable>
            {showHowItWorks && (
              <View className="px-4 pb-4 gap-2 border-t border-theme pt-3">
                <Text className="text-xs text-secondary leading-relaxed">
                  Every statement line goes through a fixed set of rules before your overrides ever get a chance to
                  apply: reference numbers and other mostly-numeric fragments are dropped, and known bank/rail connector
                  words below are stripped out — whatever&apos;s left becomes the merchant name. This list is fixed by
                  the app, not editable here; if it still gets something wrong, add an override below.
                </Text>
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mt-1">
                  Always-stripped words
                </Text>
                <Text className="text-xs text-tertiary font-mono leading-relaxed">
                  {CONNECTOR_KEYWORDS_LIST.join(', ')}
                </Text>
              </View>
            )}
          </View>

          {overrides.length === 0 ? (
            <Card>
              <EmptyState
                icon="ti-adjustments-horizontal"
                title="No overrides yet"
                description="Add one whenever the automatic merchant-recognition guess gets something wrong."
              />
            </Card>
          ) : (
            <ListContainer>
              {overrides.map((o) => (
                <View key={o.id} className="flex-row items-center gap-2 px-4 py-3">
                  <Text className="text-xs text-tertiary font-mono flex-1" numberOfLines={1}>
                    {o.keyword}
                  </Text>
                  <Icon name="ti-arrow-right" size={13} color={theme.textTertiary} />
                  <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                    {o.normalizedKey}
                  </Text>
                  <Button
                    variant="ghost"
                    icon="ti-trash"
                    accessibilityLabel="Delete override"
                    className="w-7 h-7 rounded-lg"
                    onPress={() => setDeletingId(o.id)}
                  />
                </View>
              ))}
            </ListContainer>
          )}
        </View>
      </ScrollView>

      {/* FAB — same placement/style as the Expenses tab's add-transaction FAB. */}
      <View className="absolute" style={{ bottom: insets.bottom + 16, right: 16 }}>
        <Pressable
          onPress={() => setShowAdd(true)}
          className="w-14 h-14 rounded-full shadow-lg items-center justify-center"
          style={{ backgroundColor: theme.primary }}
          accessibilityLabel="Add override"
        >
          <Icon name="ti-plus" size={24} color="#fff" />
        </Pressable>
      </View>

      {showAdd && (
        <Modal
          onClose={() => setShowAdd(false)}
          title="Add override"
          footer={
            <Button variant="primary" fullWidth disabled={!canAdd} onPress={() => void handleAdd()}>
              Add override
            </Button>
          }
        >
          <View className="gap-3">
            <TextInput
              label="Keyword in statement"
              value={keyword}
              onChange={setKeyword}
              placeholder="e.g. XYZSHOP99"
            />
            <TextInput
              label="Normalizes to"
              value={normalizesTo}
              onChange={setNormalizesTo}
              placeholder="e.g. Local Chai Shop"
            />
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
        title="Delete override?"
        message="Future statement lines matching this keyword will fall back to the automatic guess."
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </SafeAreaView>
  );
}
