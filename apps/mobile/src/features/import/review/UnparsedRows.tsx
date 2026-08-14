import { useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { Button, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';

function RejectedRowEditor({
  row,
  mapping,
  header,
  onFix,
  onDiscard
}: {
  row: RejectedRow;
  mapping: ColumnMapping | null;
  header: string[];
  onFix: (fields: { date: string; amount: string; description: string }) => boolean;
  /** Permanently excludes this row from the import (2026-08-14, redesign §9.1/Issue #1) — distinct from
   *  just leaving it unfixed, which today already silently excludes it with no visibility. Quiet/muted
   *  styling (confirmed decision) — discarding a broken row isn't alarming, just a decision. */
  onDiscard: () => void;
}) {
  const theme = useThemeColors();
  const [date, setDate] = useState(mapping && mapping.date >= 0 ? (row.raw[mapping.date] ?? '') : '');
  const [amount, setAmount] = useState(mapping && mapping.amount >= 0 ? (row.raw[mapping.amount] ?? '') : '');
  const [description, setDescription] = useState(
    mapping && mapping.description >= 0 ? (row.raw[mapping.description] ?? '') : ''
  );
  const [fixed, setFixed] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  if (fixed || discarded) return null;

  return (
    <View className="gap-2 py-2 border-b border-dashed" style={{ borderColor: tint(theme.warning, 45) }}>
      <Text className="text-[11px]" style={{ color: theme.warning }}>
        Row {row.rowIndex} · {row.reason}
      </Text>
      {/* Full original row, all columns — not just the 3 fields below. Without this the user had no way
       *  to see what the source file actually contained for a row that failed to parse (e.g. a blank
       *  description column) short of opening the CSV outside the app (found via user report 2026-08-06). */}
      <View
        className="flex-row flex-wrap gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5"
        style={{ backgroundColor: tint(theme.warning, 6) }}
      >
        {row.raw.map((value, i) => (
          <Text key={i} className="text-[10px] text-tertiary">
            <Text className="font-semibold">{header[i] || `Column ${i + 1}`}: </Text>
            {value || '(empty)'}
          </Text>
        ))}
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextInput label="Date" value={date} onChange={setDate} placeholder="DD/MM/YYYY" />
        </View>
        <View className="flex-1">
          <TextInput label="Amount" value={amount} onChange={setAmount} placeholder="0.00" />
        </View>
        <View className="flex-1">
          <TextInput label="Description" value={description} onChange={setDescription} placeholder="What was this?" />
        </View>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              if (onFix({ date, amount, description })) setFixed(true);
            }}
          >
            Include this row
          </Button>
        </View>
        <Pressable
          onPress={() => {
            onDiscard();
            setDiscarded(true);
          }}
          className="flex-row items-center gap-1 rounded-full border border-dashed px-3"
          style={{ borderColor: theme.textTertiary }}
        >
          <Icon name="ti-x" size={11} color={theme.textTertiary} />
          <Text className="text-[10.5px] font-semibold text-tertiary">Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface UnparsedRowsProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  /** Original CSV header row, used to label each column in the full-row-data display below the 3 edit
   *  fields — falls back to "Column N" for any index without a header label. */
  header: string[];
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
  /** "Discard" (2026-08-14, redesign §9.1/Issue #1) — see `RejectedRowEditor`'s own doc comment. */
  onDiscardRejected: (rowIndex: number) => void;
}

/** Hard render cap — a genuinely large rejected batch (e.g. every row in a file failing to parse — see
 *  `parseFlexibleDate`'s own doc comment for the real MoneyView bug this was found alongside) must never
 *  render ALL of them at once: each `RejectedRowEditor` mounts 3 `TextInput`s plus a full raw-column
 *  dump, so thousands of native views mounted simultaneously for a 1500+-row file crashed the app
 *  outright on a real device (RN Web's much cheaper DOM + far more available memory tolerated it fine).
 *  2026-08-14 (code-review fix): the original "+N more" toggle still rendered EVERY row once tapped —
 *  the exact same shape of unbounded-`.map()` bug `TileRowList.tsx` was fixed for in this same pass, just
 *  not yet applied here. Now there is no expand toggle at all — a fixed-height, internally-scrolling
 *  container (mirroring `TileRowList.tsx`'s own fix) replaces it, so the render count is a REAL cap,
 *  never something a tap can defeat. */
const INITIAL_VISIBLE_ROWS = 20;
/** Taller than `TileRowList.tsx`'s own 260 — each `RejectedRowEditor` is a much heavier row (3 inputs +
 *  a full raw-column dump vs. one line of text), so a shorter box would feel cramped for what's already
 *  a "something needs fixing" flow the user is likely to spend real time in. */
const SCROLL_MAX_HEIGHT = 420;

/** RN port of apps/web-react/src/features/import/review/UnparsedRows.tsx. "Rows needing attention" —
 *  structurally unparsed rows (missing date/amount/description), kept visually distinct (amber/warning
 *  tone) from category-undecided state, so a user never confuses "structurally broken" with "category
 *  undecided". */
export function UnparsedRows({ rejectedRows, mapping, header, onFixRejected, onDiscardRejected }: UnparsedRowsProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  if (rejectedRows.length === 0) return null;
  const visibleRows = rejectedRows.slice(0, INITIAL_VISIBLE_ROWS);
  const needsScroll = rejectedRows.length > 3;

  const editors = visibleRows.map((row) => (
    <RejectedRowEditor
      key={row.rowIndex}
      row={row}
      mapping={mapping}
      header={header}
      onFix={(fields) => onFixRejected(row.rowIndex, fields)}
      onDiscard={() => onDiscardRejected(row.rowIndex)}
    />
  ));

  return (
    <View
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: tint(theme.warning, 10), borderWidth: 1, borderColor: tint(theme.warning, 45) }}
    >
      <Pressable onPress={() => setExpanded((e) => !e)} className="flex-row items-center justify-between gap-2 p-3">
        <View className="flex-1 flex-row items-center gap-1.5">
          <Icon name="ti-alert-triangle" size={14} color={theme.warning} />
          <Text className="text-xs font-bold flex-1" style={{ color: theme.warning }}>
            {rejectedRows.length} row{rejectedRows.length !== 1 ? 's' : ''} need fixing before they can be categorized
          </Text>
        </View>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.warning} />
      </Pressable>
      {expanded && (
        <View className="px-3 pb-3 pt-1 border-t border-dashed" style={{ borderColor: tint(theme.warning, 45) }}>
          {needsScroll ? (
            <ScrollView style={{ maxHeight: SCROLL_MAX_HEIGHT }} nestedScrollEnabled showsVerticalScrollIndicator>
              {editors}
            </ScrollView>
          ) : (
            editors
          )}
          {rejectedRows.length > INITIAL_VISIBLE_ROWS && (
            <Text className="text-center text-xs font-semibold pt-2" style={{ color: theme.warning }}>
              {rejectedRows.length} rows need fixing · showing first {INITIAL_VISIBLE_ROWS}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
