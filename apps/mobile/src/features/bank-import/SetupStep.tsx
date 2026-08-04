import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Button, Card, SectionLabel, SelectInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatDateShort } from '@/lib/date';
import { CUSTOM_PRESET_ID } from '@/core/bank-import/presets';
import type { BankPresetId } from '@/core/bank-import/types';
import type { UseBankImportReturn } from './useBankImport';
import { MappingEditModal } from './MappingEditModal';

interface SetupStepProps {
  bi: UseBankImportReturn;
}

const MAPPING_FIELDS: { key: 'date' | 'narration' | 'debit' | 'credit' | 'balance'; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'narration', label: 'Narration' },
  { key: 'debit', label: 'Debit / withdrawal' },
  { key: 'credit', label: 'Credit / deposit' },
  { key: 'balance', label: 'Balance' }
];

/**
 * The single merged setup screen — bank selection, file upload, and column-mapping review, all in
 * one place (mockup `#s2`'s two screens collapsed into one, 2026-08-03, per explicit user feedback:
 * the bank list can grow so it's a dropdown rather than a tile grid, and the mapping is reviewed
 * inline as soon as a file is uploaded rather than a separate full-screen step). Was `PresetStep` +
 * `UploadStep` + `MappingStep`; those 3 files are gone, this replaces all of them.
 */
export function SetupStep({ bi }: SetupStepProps) {
  const theme = useThemeColors();
  const [showMappingEdit, setShowMappingEdit] = useState(false);

  const bankOptions = [
    ...bi.banks.map((b) => ({ value: b.id, label: b.label })),
    { value: CUSTOM_PRESET_ID, label: 'Other / Custom' }
  ];
  const bankLabel = bi.isCustomPreset
    ? 'your custom format'
    : (bi.banks.find((b) => b.id === bi.presetId)?.label ?? 'your bank');

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' ? '*/*' : ['text/csv', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
    bi.importFromText(text, asset.name);
  }

  const dates = bi.mappingPreview?.rows.map((r) => r.date) ?? [];
  const minDate = dates.length > 0 ? Math.min(...dates) : null;
  const maxDate = dates.length > 0 ? Math.max(...dates) : null;

  return (
    <View className="gap-4">
      <View className="gap-2">
        <SectionLabel className="mb-0">Bank</SectionLabel>
        <SelectInput
          value={bi.presetId ?? ''}
          onChange={(v) => bi.selectPreset(v as BankPresetId)}
          options={bankOptions}
          placeholder="Select your bank"
        />
      </View>

      {bi.presetId !== null && (
        <View className="gap-2">
          <SectionLabel className="mb-0">Statement file</SectionLabel>
          <Text className="text-xs text-tertiary -mt-1">
            Upload a CSV statement export from {bankLabel}. Delimiter and every column stay editable below.
          </Text>
          <Pressable
            onPress={() => void pickFile()}
            className="bg-surface rounded-xl p-8 items-center gap-3 border-2 border-dashed border-theme"
          >
            <Icon name="ti-file-upload" size={30} color={theme.textTertiary} />
            <Text className="text-sm text-secondary text-center">{bi.fileName || 'Tap to choose a CSV file'}</Text>
          </Pressable>
          {bi.parseError ? (
            <Text className="text-xs" style={{ color: theme.danger }}>
              {bi.parseError}
            </Text>
          ) : null}
        </View>
      )}

      {bi.headers.length > 0 && (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <SectionLabel className="mb-0">Column mapping</SectionLabel>
            <Pressable
              onPress={() => setShowMappingEdit(true)}
              className="flex-row items-center gap-1"
              accessibilityLabel="Edit column mapping"
            >
              <Icon name="ti-pencil" size={12} color={theme.primary} />
              <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                Edit mapping
              </Text>
            </Pressable>
          </View>
          <Card padding="sm" radius="md">
            {MAPPING_FIELDS.map(({ key, label }, i) => (
              <View
                key={key}
                className={`flex-row items-center justify-between py-2 ${i > 0 ? 'border-t border-theme' : ''}`}
              >
                <Text className="text-xs text-secondary">{label}</Text>
                <Text className="text-xs font-medium text-primary">{bi.mapping[key] || '— Not mapped —'}</Text>
              </View>
            ))}
          </Card>
          {bi.mappingPreview && (
            <Text className="text-xs text-tertiary">
              {bi.mappingPreview.rows.length} row{bi.mappingPreview.rows.length === 1 ? '' : 's'} detected
              {minDate !== null && maxDate !== null ? ` · ${formatDateShort(minDate)}–${formatDateShort(maxDate)}` : ''}
              {bi.mappingPreview.rejected.length > 0
                ? ` · ${bi.mappingPreview.rejected.length} row${bi.mappingPreview.rejected.length === 1 ? '' : 's'} couldn't be read`
                : ''}
            </Text>
          )}
          <Button variant="primary" fullWidth disabled={!bi.mappingReady} onPress={bi.confirmMapping}>
            Continue to review
          </Button>
        </View>
      )}

      {showMappingEdit && <MappingEditModal bi={bi} onClose={() => setShowMappingEdit(false)} />}
    </View>
  );
}
