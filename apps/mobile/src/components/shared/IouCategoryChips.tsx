import { useMemo } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import type { ExpenseCategory } from '@/core/db/types';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { selectionRingStyle } from '~/lib/color';
import { IOU_ALL_CHOICES, type IouCategoryChoice } from './iouCategoryChoices';

interface IouCategoryChipsProps {
  /** Live category data (name/icon/color) — read the same way every other category picker in the
   *  app does, never hardcoded (matches `IOU_ALL_CHOICES`' own fallback-only convention). */
  categories: ExpenseCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  /** Category ids that can't be picked right now — e.g. Settle Up's Lending/Borrowed Money (settling
   *  never creates new debt), or whichever of the 2 settlement tiles doesn't match the actual net
   *  direction. Dimmed and non-interactive, same visual language as `AccountChips`' own disabled tile. */
  disabledIds?: Set<string>;
}

/**
 * Horizontal, scrollable picker for the 4 real IOU categories (Lending / Borrowed Money / Return
 * Borrowed / Collected Money) — the same visual `AccountChips`/`PaymentModeChips`/the real category
 * picker's own quick-pick row all use (colored rounded-square icon + tiny label, selection halo).
 * Replaces the old `OptionButton` 2×2 grid (2026-08-27, mockup
 * `docs/mockups/proposals/iou-popups-expenseform-alignment-v1.html`) so Add IOU / Settle Up read like
 * every other "pick one of a few" field in this app instead of a fourth, different tile shape.
 */
export function IouCategoryChips({ categories, value, onChange, disabledIds }: IouCategoryChipsProps) {
  const theme = useThemeColors();
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {IOU_ALL_CHOICES.map((c: IouCategoryChoice) => {
        const cat = categoryById.get(c.categoryId);
        const color = cat?.color ?? theme.textTertiary;
        const isSelected = value === c.categoryId;
        const isDisabled = !!disabledIds?.has(c.categoryId);
        return (
          <Pressable
            key={c.categoryId}
            disabled={isDisabled}
            onPress={() => onChange(c.categoryId)}
            className="items-center gap-1 w-[58px]"
            style={{ opacity: isDisabled ? 0.35 : 1 }}
          >
            <View style={selectionRingStyle(isSelected, theme.surface, color)}>
              <View className="w-9 h-9 rounded-[10px] items-center justify-center" style={{ backgroundColor: color }}>
                <Icon name={cat?.icon ?? c.fallbackIcon} size={15} color="#fff" />
              </View>
            </View>
            <Text className="text-[8px] font-medium text-center leading-tight text-secondary w-full" numberOfLines={2}>
              {cat?.name ?? c.fallbackLabel}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
