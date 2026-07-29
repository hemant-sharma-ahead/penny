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
  onFix
}: {
  row: RejectedRow;
  mapping: ColumnMapping | null;
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
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
}

/** RN port of apps/web-react/src/features/import/review/UnparsedRows.tsx. "Rows needing attention" —
 *  structurally unparsed rows (missing date/amount/description), kept visually distinct (amber/warning
 *  tone) from category-undecided state, so a user never confuses "structurally broken" with "category
 *  undecided". */
export function UnparsedRows({ rejectedRows, mapping, onFixRejected }: UnparsedRowsProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  if (rejectedRows.length === 0) return null;

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
          {rejectedRows.map((row) => (
            <RejectedRowEditor
              key={row.rowIndex}
              row={row}
              mapping={mapping}
              onFix={(fields) => onFixRejected(row.rowIndex, fields)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
