import { View } from 'react-native';
import { Button, Modal, SectionLabel, SegmentedControl, SelectInput } from '~/components/ui';
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
      {bi.isCustomPreset && (
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
