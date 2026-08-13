import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
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
  onFix
}: {
  row: RejectedRow;
  mapping: ColumnMapping | null;
  header: string[];
  onFix: (fields: { date: string; amount: string; description: string }) => boolean;
}) {
  const theme = useThemeColors();
  const [date, setDate] = useState(mapping && mapping.date >= 0 ? (row.raw[mapping.date] ?? '') : '');
  const [amount, setAmount] = useState(mapping && mapping.amount >= 0 ? (row.raw[mapping.amount] ?? '') : '');
  const [description, setDescription] = useState(
    mapping && mapping.description >= 0 ? (row.raw[mapping.description] ?? '') : ''
  );
  const [fixed, setFixed] = useState(false);

  if (fixed) return null;

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
  );
}

interface UnparsedRowsProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  /** Original CSV header row, used to label each column in the full-row-data display below the 3 edit
   *  fields — falls back to "Column N" for any index without a header label. */
  header: string[];
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
}

/** Initial render cap — same "show first N, then a real toggle" convention `CategoryTile.tsx` already
 *  uses for its own row list, applied here for the same reason (2026-08-13): a genuinely large rejected
 *  batch (e.g. every row in a file failing to parse — see `parseFlexibleDate`'s own doc comment for the
 *  real MoneyView bug this was found alongside) used to render ALL of them at once, each a
 *  `RejectedRowEditor` with 3 `TextInput`s plus a full raw-column dump — thousands of native views
 *  mounted simultaneously for a 1500+-row file, which crashed the app outright on a real device (while
 *  RN Web's much cheaper DOM + far more available memory tolerated it fine). This cap is defense in
 *  depth independent of that date-parsing fix — any other future/format-specific rejection spike should
 *  never be able to repeat this crash either. */
const INITIAL_VISIBLE_ROWS = 20;

/** RN port of apps/web-react/src/features/import/review/UnparsedRows.tsx. "Rows needing attention" —
 *  structurally unparsed rows (missing date/amount/description), kept visually distinct (amber/warning
 *  tone) from category-undecided state, so a user never confuses "structurally broken" with "category
 *  undecided". */
export function UnparsedRows({ rejectedRows, mapping, header, onFixRejected }: UnparsedRowsProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  if (rejectedRows.length === 0) return null;
  const visibleRows = showAll ? rejectedRows : rejectedRows.slice(0, INITIAL_VISIBLE_ROWS);

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
          {visibleRows.map((row) => (
            <RejectedRowEditor
              key={row.rowIndex}
              row={row}
              mapping={mapping}
              header={header}
              onFix={(fields) => onFixRejected(row.rowIndex, fields)}
            />
          ))}
          {rejectedRows.length > INITIAL_VISIBLE_ROWS && (
            <Pressable onPress={() => setShowAll((v) => !v)} className="items-center py-2">
              <Text className="text-xs font-semibold" style={{ color: theme.warning }}>
                {showAll ? 'Show fewer' : `+ ${rejectedRows.length - INITIAL_VISIBLE_ROWS} more`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
