import { useMemo, useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import { DID_YOU_KNOW_FACTS } from '@/core/tips/didYouKnowFacts';
import type { TipModule } from '@/core/tips/types';

interface Props {
  /** Prefers facts tagged with this module; falls back to the curated cross-module pool if none match
   *  (or if omitted entirely — e.g. Home's own general card, see `DailyTipCard.tsx` for Home's actual
   *  sequential/daily variant, which is a separate component, not this one). */
  module?: TipModule;
  /** "See all tips" link — omit entirely to hide it (Tax's own screen has its own dedicated fact list
   *  and no reason to point elsewhere). */
  onSeeAll?: () => void;
}

/**
 * Tier 2 "Did You Know" ambient card (2026-08-16) — generalizes the original Tax-only `DidYouKnow.tsx`
 * (same visual language: `ti-bulb`, "Did you know?" eyebrow, tap-to-cycle) into a shared, module-aware
 * component. Used by Tax (`module="tax"`, no `onSeeAll`) and Analytics (`module="analytics"`, with
 * `onSeeAll`) — low-stakes, always renders something, no daily pacing or dismiss state of its own
 * (that's Home's `DailyTipCard`'s job specifically).
 */
export function DidYouKnowCard({ module, onSeeAll }: Props) {
  const theme = useThemeColors();
  const pool = useMemo(() => {
    if (module) {
      const scoped = DID_YOU_KNOW_FACTS.filter((f) => f.module === module);
      if (scoped.length > 0) return scoped;
    }
    return DID_YOU_KNOW_FACTS.filter((f) => f.curated);
  }, [module]);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * pool.length));
  const fact = pool[idx % pool.length];
  const color = theme.info;

  if (!fact) return null;

  return (
    <Pressable
      onPress={() => setIdx((i) => (i + 1) % pool.length)}
      accessibilityLabel="Show another tip"
      className="rounded-xl border p-3 flex-row gap-2"
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
    >
      <Icon name="ti-bulb" size={16} color={color} />
      <View className="flex-1 gap-0.5">
        <Text
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: ink(color, theme.textPrimary) }}
        >
          Did you know?
        </Text>
        <Text className="text-xs leading-relaxed" style={{ color: ink(color, theme.textPrimary) }}>
          {fact.text}
        </Text>
        <View className="flex-row items-center justify-between mt-0.5">
          <Text className="text-[10px]" style={{ color: ink(color, theme.textPrimary), opacity: 0.7 }}>
            Tap for another
          </Text>
          {onSeeAll && (
            <Pressable onPress={onSeeAll} hitSlop={6}>
              <Text className="text-[10px] font-semibold" style={{ color }}>
                See all tips →
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
