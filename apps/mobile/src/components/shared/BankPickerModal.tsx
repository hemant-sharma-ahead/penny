import { View, Pressable, ScrollView, Text } from 'react-native';
import type { BankPresetId } from '@/core/db/types';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BankLogo } from './BankLogo';
import { bankAccentColor } from './bankAccentColor';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

export interface BankPickerOption {
  value: string;
  label: string;
  /** Real preset id for the `BankLogo` lookup — omit for a non-bank sentinel (e.g. "Other / Custom",
   *  "Not set"), which renders a plain dashed/dots placeholder instead of a logo. */
  bankId?: BankPresetId;
  /** Renders after every alphabetized real-bank row, in the order given, instead of being sorted in
   *  among real bank names — for a sentinel option like "Other / Custom" or "Not set". */
  pinLast?: boolean;
}

interface BankPickerModalProps {
  title?: string;
  options: BankPickerOption[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/**
 * Shared bank-selection popup — real per-bank logo (or brand-color-tinted generic fallback,
 * `BankLogo.tsx`'s existing resolution) + name, alphabetical, replacing a plain text-only
 * `SelectInput` dropdown (2026-08-27, mockup `docs/mockups/proposals/bank-import-followups-v1.html`
 * §2). Reuses `AccountList.tsx`'s own recently-approved flat-bordered-row visual rather than
 * inventing a new "pick one of a few" shape. Used by both `SetupStep.tsx` (Bank Import's own bank
 * field) and `AccountFormModal.tsx` (an account's optional `bankId`) — the identical gap existed in
 * both, found while fixing the one that was originally reported.
 */
export function BankPickerModal({
  title = 'Select your bank',
  options,
  value,
  onSelect,
  onClose
}: BankPickerModalProps) {
  const theme = useThemeColors();
  const sorted = [...options.filter((o) => !o.pinLast)].sort((a, b) => a.label.localeCompare(b.label));
  const pinned = options.filter((o) => o.pinLast);

  function renderRow(opt: BankPickerOption) {
    const isSelected = value === opt.value;
    const bg = opt.bankId ? bankAccentColor({ bankId: opt.bankId, color: theme.textTertiary }) : theme.textTertiary;
    return (
      <Pressable
        key={opt.value}
        onPress={() => {
          onSelect(opt.value);
          onClose();
        }}
        className="flex-row items-center gap-2.5 px-3 py-2.5 rounded-xl border mb-1.5"
        style={{
          borderColor: isSelected ? theme.primary : theme.border,
          backgroundColor: isSelected ? tint(theme.primary, 8) : 'transparent'
        }}
      >
        <View
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={
            opt.bankId ? { backgroundColor: bg } : { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border }
          }
        >
          {opt.bankId ? (
            <BankLogo
              account={{ bankId: opt.bankId, icon: 'ti-building-bank', color: theme.textTertiary }}
              size={13}
              color="#fff"
            />
          ) : (
            <Icon name="ti-dots" size={13} color={theme.textTertiary} />
          )}
        </View>
        <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
          {opt.label}
        </Text>
        {isSelected && <Icon name="ti-check" size={15} color={theme.primary} />}
      </Pressable>
    );
  }

  return (
    <Modal onClose={onClose} title={title}>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        {sorted.map(renderRow)}
        {pinned.length > 0 && <View className="border-t border-theme my-1.5" />}
        {pinned.map(renderRow)}
      </ScrollView>
    </Modal>
  );
}
