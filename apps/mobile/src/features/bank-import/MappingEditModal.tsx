import { View, Text } from 'react-native';
import { Button, Modal, SectionLabel, SegmentedControl, SelectInput, TextInput } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseBankImportReturn } from './useBankImport';

interface MappingEditModalProps {
  bi: UseBankImportReturn;
  onClose: () => void;
}

const NONE = '';

function headerOptions(headers: string[]) {
  return [
    { value: NONE, label: '— Not mapped —' },
    ...headers.map((h) => ({ value: h, label: h || '(blank header)' }))
  ];
}

const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma ( , )' },
  { value: ';', label: 'Semicolon ( ; )' },
  { value: '\t', label: 'Tab' }
];

/**
 * One popup, every column-mapping field together (user's explicit preference over a per-field
 * pencil icon) — opened from `SetupStep.tsx`'s "Edit mapping" action. Every change writes straight
 * into `useBankImport.ts`'s live draft state (`setMappingField`), so "Done" just closes the popup —
 * there's nothing further to persist.
 */
export function MappingEditModal({ bi, onClose }: MappingEditModalProps) {
  const theme = useThemeColors();
  const options = headerOptions(bi.headers);

  return (
    <Modal
      scrollable
      onClose={onClose}
      title="Column mapping"
      footer={
        <Button fullWidth onPress={onClose}>
          Done
        </Button>
      }
    >
      {/* No delimiter concept for an Excel file — it's already parsed into real cells, not raw text
          that needs splitting (2026-08-05, issue #4). */}
      {bi.isCustomPreset && !bi.isXlsxSource && (
        <View className="gap-2">
          <SectionLabel>Delimiter</SectionLabel>
          <SegmentedControl options={DELIMITER_OPTIONS} value={bi.delimiter} onChange={bi.setDelimiter} />
        </View>
      )}

      <View className="gap-3">
        <SelectInput
          label="Date"
          required
          value={bi.mapping.date}
          onChange={(v) => bi.setMappingField('date', v)}
          options={options}
        />
        {/* Date format (2026-08-05, reworked same day from a 2-option day-first/month-first toggle
            after direct user feedback — real statements vary far more than that, e.g. `DD-MM-YY` or a
            no-separator `DDMMMYYYY`). A free-text token field, not a fixed set of choices — pre-filled
            with the smart-detected/preset value; confident whenever a known bank preset is active or
            the file's own date values contain unambiguous evidence for exactly one candidate shape,
            otherwise flagged so the user actually looks at it instead of trusting a silent guess. */}
        <View className="gap-1.5">
          <TextInput
            label="Date format"
            value={bi.dateFormat}
            onChange={bi.setDateFormat}
            placeholder="e.g. DD/MM/YYYY"
          />
          <Text className="text-[11px] text-tertiary">
            Use DD, MM, YYYY, YY, or MMM (a 3-letter month name) — e.g. DD/MM/YYYY, DD-MM-YY, DD MMM YYYY, or a
            no-separator DDMMMYYYY for a date like "22Feb2026".
          </Text>
          <Text className="text-[11px]" style={{ color: bi.dateFormatConfident ? theme.textTertiary : theme.warning }}>
            {bi.dateFormatConfident
              ? 'Detected from the file — change it if this looks wrong.'
              : "Couldn't tell for sure from this file — please confirm the date format."}
          </Text>
        </View>
        <SelectInput
          label="Narration"
          required
          value={bi.mapping.narration}
          onChange={(v) => bi.setMappingField('narration', v)}
          options={options}
        />
        <SelectInput
          label="Debit / withdrawal"
          value={bi.mapping.debit}
          onChange={(v) => bi.setMappingField('debit', v)}
          options={options}
          hint="At least one of Debit/Credit is required."
        />
        <SelectInput
          label="Credit / deposit"
          value={bi.mapping.credit}
          onChange={(v) => bi.setMappingField('credit', v)}
          options={options}
        />
        <SelectInput
          label="Balance (optional)"
          value={bi.mapping.balance}
          onChange={(v) => bi.setMappingField('balance', v)}
          options={options}
          hint="Powers a post-import balance check against your recorded transactions."
        />
      </View>
    </Modal>
  );
}
