import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

interface SmsTileAction {
  label: string;
  onPress: () => void;
  variant?: 'secondary' | 'ghost';
  /** Stretches to fill the footer row alone — for a single primary action (e.g. "Review match ›"),
   *  matching the mockup's single full-width footer button on those tile variants. */
  full?: boolean;
}

interface SmsTileProps {
  /** Header content — a short label, e.g. `"SBIINB SMS"` or `"₹1,240 · Amazon"`. */
  title: ReactNode;
  /** Small badge on the header's right/wrapped edge, e.g. "Ambiguous account"/"Possible match". */
  badgeLabel: string;
  badgeIcon: string;
  actions: SmsTileAction[];
  /** Optional muted trailing note next to `title` (e.g. "no account yet"). */
  note?: string;
}

/**
 * One resolution tile inside a `BucketCard` body — the SMS-tracking-specific equivalent of `features/
 * import/review/CategoryTile.tsx`'s collapsed-header shell (mockup `.tile`), but genuinely its own,
 * simpler component rather than a fork: `CategoryTile` is deeply coupled to CSV-import's `ParsedRow`/
 * `RowOverride`/bulk-select machinery, none of which SMS review tiles need (each item resolves
 * independently, one at a time — no per-row bulk selection here). `BucketCard.tsx`/`useBucketExpansion.ts`
 * ARE reused directly (unmodified) for the outer bucket shell — see `SmsReviewPage.tsx`.
 */
export function SmsTile({ title, badgeLabel, badgeIcon, actions, note }: SmsTileProps) {
  const theme = useThemeColors();
  return (
    <View className="rounded-xl overflow-hidden border border-theme">
      <View
        className="p-2.5 flex-row items-center gap-2 flex-wrap"
        style={{ backgroundColor: tint(theme.warning, 12) }}
      >
        <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
          {title}
        </Text>
        {note && <Text className="text-[10.5px] italic text-tertiary">{note}</Text>}
        <View
          className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5 ml-auto"
          style={{ backgroundColor: tint(theme.warning, 18) }}
        >
          <Icon name={badgeIcon} size={9} color={theme.warning} />
          <Text className="text-[8px] font-extrabold uppercase tracking-wide" style={{ color: theme.warning }}>
            {badgeLabel}
          </Text>
        </View>
      </View>
      <View className="border-t border-theme bg-surface p-2.5 flex-row gap-2">
        {actions.map((action) => (
          <View key={action.label} className={action.full ? 'flex-1' : undefined}>
            <Button size="sm" variant={action.variant ?? 'secondary'} onPress={action.onPress} fullWidth={action.full}>
              {action.label}
            </Button>
          </View>
        ))}
      </View>
    </View>
  );
}
