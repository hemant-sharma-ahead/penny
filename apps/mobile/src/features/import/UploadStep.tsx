import { View, Pressable, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Button, Card, OptionButton, SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { downloadCsv } from '@/core/export/exportCsv';
import {
  PENNY_TEMPLATE,
  IMPORT_FORMATS,
  FORMAT_LABELS,
  FORMAT_COLUMNS,
  type ImportFormat
} from '@/core/import/importParsers';

interface UploadStepProps {
  format: ImportFormat;
  setFormat: (f: ImportFormat) => void;
  parseError: string;
  onText: (text: string) => void;
}

/**
 * RN port of apps/web-legacy/src/features/import/UploadStep.tsx. Web's `<input type=file>` +
 * `FileReader.readAsText` becomes `expo-document-picker`'s `getDocumentAsync` + `expo-file-system`'s
 * `File.text()` — same pattern already proven in onboarding's `AccountRecoveryScreen`. Template download
 * reuses `downloadCsv` (already ported to `expo-file-system`+`expo-sharing` for Expenses' CSV export).
 */
export function UploadStep({ format, setFormat, parseError, onText }: UploadStepProps) {
  const theme = useThemeColors();

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    const text = await new File(result.assets[0].uri).text();
    onText(text);
  }

  return (
    <>
      <View className="gap-2">
        <SectionLabel>Format</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          {IMPORT_FORMATS.map((f) => (
            <View key={f} className="w-[48%]">
              <OptionButton label={FORMAT_LABELS[f]} selected={format === f} onPress={() => setFormat(f)} compact />
            </View>
          ))}
        </View>
      </View>

      {format === 'penny' && (
        <Button
          variant="ghost"
          size="sm"
          icon="ti-download"
          textColor={theme.primary}
          onPress={() => void downloadCsv(PENNY_TEMPLATE, 'penny-import-template.csv')}
        >
          Download Penny CSV template
        </Button>
      )}

      <View className="gap-2">
        <SectionLabel>File</SectionLabel>
        <Pressable
          onPress={() => void pickFile()}
          className="bg-surface rounded-xl p-6 items-center gap-3 border-2 border-dashed border-theme"
        >
          <Icon name="ti-file-upload" size={32} color={theme.textTertiary} />
          <Text className="text-sm text-secondary text-center">Tap to select a CSV file</Text>
        </Pressable>
        {parseError ? (
          <Text className="text-xs" style={{ color: theme.danger }}>
            {parseError}
          </Text>
        ) : null}
      </View>

      <Card padding="sm" radius="md" className="gap-1.5">
        <Text className="text-xs font-semibold text-secondary">Expected columns for {FORMAT_LABELS[format]}</Text>
        <Text className="text-xs text-tertiary font-mono leading-relaxed">{FORMAT_COLUMNS[format]}</Text>
      </Card>
    </>
  );
}
