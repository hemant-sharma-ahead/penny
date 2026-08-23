import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { ParsedRow } from '@/core/import/importParsers';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface CarryForwardExcludedProps {
  rows: ParsedRow[];
}

/** Same render-cap reasoning as `TileRowList.tsx`/`TransactionsStage.tsx`'s tile-list cap
 *  (docs/ARCHITECTURE.md's "unbounded `.map()` over bulk-imported data" rule) — this list is real
 *  MoneyView carry-forward-marker data straight from the parsed file, not a small fixed set, so it
 *  gets the same defensive cap even though it's typically modest in practice (2026-08-21). */
const INITIAL_RENDER_CAP = 60;
const LOAD_MORE_BATCH = 60;

/**
 * RN port of apps/web-react/src/features/import/review/CarryForwardExcluded.tsx. Surfaces
 * MoneyView-style monthly carry-forward markers ("Cash Forward" et al) that were excluded from the
 * batch — see `importCarryForward.ts`'s `identifyRedundantCarryForwardRows()`. Structurally distinct
 * from both `UnparsedRows` (structurally broken, unparseable rows) and a duplicate/skipped row (a user
 * or dedup decision) — this is neither: it's a real, successfully-parsed row that Penny simply doesn't
 * need to write. Informational only, but never silently dropped.
 */
export function CarryForwardExcluded({ rows }: CarryForwardExcludedProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_CAP);
  if (rows.length === 0) return null;
  const remaining = rows.length - visibleCount;

  return (
    <View
      className="rounded-xl overflow-hidden bg-surface-3"
      style={{ borderWidth: 1, borderColor: tint(theme.neutral, 45) }}
    >
      <Pressable onPress={() => setExpanded((e) => !e)} className="flex-row items-center justify-between gap-2 p-3">
        <View className="flex-1 flex-row items-center gap-1.5">
          <Icon name="ti-recycle" size={14} color={theme.textTertiary} />
          <Text className="text-xs font-bold text-secondary flex-1">
            {rows.length} recurring carry-forward marker{rows.length !== 1 ? 's' : ''} excluded
          </Text>
        </View>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>
      {expanded && (
        <View className="px-3 pb-3 pt-2 border-t border-theme gap-1.5">
          <Text className="text-[10.5px] text-tertiary leading-relaxed">
            Already reflected in your other transactions — every carry-forward marker just repeats the same leftover
            cash your real transactions already account for, so none of them are imported.
          </Text>
          <View>
            {rows.slice(0, visibleCount).map((row, i) => (
              <View
                key={i}
                className={`flex-row items-center justify-between gap-2 py-1.5 ${i > 0 ? 'border-t border-dashed border-theme' : ''}`}
              >
                <Text className="text-[10.5px] text-secondary flex-1" numberOfLines={1}>
                  {row.account ? `${row.account} · ` : ''}
                  {fmtShortDate(row.date)}
                </Text>
                <Text className="text-[10.5px] font-semibold text-tertiary flex-shrink-0">
                  {formatCurrency(row.amount)}
                </Text>
              </View>
            ))}
            {remaining > 0 && (
              <Pressable onPress={() => setVisibleCount((v) => v + LOAD_MORE_BATCH)} className="pt-1.5">
                <Text className="text-[10.5px] font-semibold" style={{ color: theme.primary }}>
                  Show {Math.min(remaining, LOAD_MORE_BATCH)} more ({remaining} left)
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
