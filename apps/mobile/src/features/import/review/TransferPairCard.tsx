import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency, formatCompact } from '@/lib/formatters';
import type { DisplayTransferPair } from '../useImport';

interface TransferPairCardProps {
  pair: DisplayTransferPair;
  /** "Not a transfer — log separately" (2026-08-13, review redesign issue #4) — omitted (no button
   *  rendered) for an `alreadyImported` pair, which has nothing left to un-pair (it's not counted or
   *  written either way). Un-pairing removes this pair from "Linked transfers" entirely and lets its two
   *  rows rejoin their own normal per-sourceName-per-type category tiles — see `useImport.ts`'s
   *  `unpairedTransferKeys` doc comment. */
  onUnpair?: () => void;
}

/** RN port of apps/web-react/src/features/import/review/TransferPairCard.tsx. One detected
 *  "self-transfer" pair rendered as a single compact "Account A → Account B" card instead of two
 *  separate line items. When either leg is a duplicate/skipped row (`alreadyImported`), the pair is
 *  still shown — never silently dropped — but dimmed to the neutral tone used for "duplicate"
 *  elsewhere on the review screen, with an "Already imported" tag instead of "Transfer", and it is NOT
 *  counted or written (see confirmedTransferPairs in useImport.ts). */
export function TransferPairCard({ pair, onUnpair }: TransferPairCardProps) {
  const theme = useThemeColors();
  const dimmed = pair.alreadyImported;
  const accentColor = dimmed ? theme.neutral : theme.info;

  return (
    <View
      className="rounded-xl p-3 gap-2"
      style={{ backgroundColor: tint(accentColor, 10), borderWidth: 1, borderColor: tint(accentColor, 30) }}
    >
      <View className="flex-row items-center gap-2">
        <View className="flex-1 items-center">
          <Text
            className="text-[11px] font-extrabold text-center"
            numberOfLines={1}
            style={{ color: dimmed ? theme.textTertiary : theme.textPrimary }}
          >
            {pair.fromAccount}
          </Text>
          <Text className="text-[9.5px] text-secondary">-{formatCurrency(pair.amount)}</Text>
        </View>
        <View className="items-center flex-shrink-0" style={{ minWidth: 64 }}>
          <Icon name="ti-arrow-narrow-right" size={18} color={accentColor} />
          <Text className="text-xs font-extrabold" style={{ color: accentColor }}>
            {formatCompact(pair.amount)}
          </Text>
          <Text className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: accentColor }}>
            {dimmed ? 'Already imported' : 'Transfer'}
          </Text>
        </View>
        <View className="flex-1 items-center">
          <Text
            className="text-[11px] font-extrabold text-center"
            numberOfLines={1}
            style={{ color: dimmed ? theme.textTertiary : theme.textPrimary }}
          >
            {pair.toAccount}
          </Text>
          <Text className="text-[9.5px] font-semibold" style={{ color: dimmed ? theme.textTertiary : theme.success }}>
            +{formatCurrency(pair.amount)}
          </Text>
        </View>
      </View>
      {!dimmed && onUnpair && (
        <Pressable
          onPress={onUnpair}
          className="flex-row items-center justify-center gap-1.5 rounded-full py-1.5 border border-theme"
        >
          <Icon name="ti-arrows-split" size={12} color={theme.textSecondary} />
          <Text className="text-[9.5px] font-semibold text-secondary">Not a transfer — log separately</Text>
        </Pressable>
      )}
    </View>
  );
}
