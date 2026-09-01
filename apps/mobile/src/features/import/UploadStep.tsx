import { useState } from 'react';
import { View, Pressable, Text, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Button, Card, OptionButton, PennyLoader, SectionLabel } from '~/components/ui';
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
import { ImportCleanupPanel } from './ImportCleanupPanel';

interface UploadStepProps {
  format: ImportFormat;
  setFormat: (f: ImportFormat) => void;
  parseError: string;
  onText: (text: string) => void;
  /** Surfaces a file-read failure through the same `parseError` banner `onText`'s own downstream
   *  parsing errors already use — never let a bad file/picker hiccup throw uncaught (2026-08-13). */
  onError: (message: string) => void;
}

/**
 * RN port of apps/web-react/src/features/import/UploadStep.tsx. Web's `<input type=file>` +
 * `FileReader.readAsText` becomes `expo-document-picker`'s `getDocumentAsync` + `expo-file-system`'s
 * `File.text()` — same pattern already proven in onboarding's `AccountRecoveryScreen`. Template download
 * reuses `downloadCsv` (already ported to `expo-file-system`+`expo-sharing` for Expenses' CSV export).
 * Adds the 'Custom / other' 5th tile (map-your-own-columns) web has always had — the prior mobile wizard
 * excluded it entirely since it had no Map-columns step; that gap is closed by `MapColumnsStep.tsx`.
 */
export function UploadStep({ format, setFormat, parseError, onText, onError }: UploadStepProps) {
  const theme = useThemeColors();
  const [cleanupOpen, setCleanupOpen] = useState(false);
  // Item 69 fix (8th batch, real-device testing pass) — `onText()` synchronously runs the full CSV
  // parse + `goToAccountsStage()`'s O(rows) account-resolution scan in one call stack, with zero loading
  // state anywhere in between; for a large file this freezes the UI with no feedback before jumping
  // straight to the Accounts stage. `parsing` shows a `PennyLoader` the INSTANT a file's text is read,
  // and the actual `onText(text)` call is deferred by one macrotask (`setTimeout(0)`) so React gets a
  // chance to actually paint that loader before the heavy synchronous work blocks the JS thread — same
  // "gate behind one extra render, flip via setTimeout(0)" pattern as `ExpensesPage.tsx`'s
  // `analyticsReady` (its own doc comment explains why `setTimeout(0)`, not `InteractionManager`, is used
  // here). Purely a feedback fix — the parse itself isn't any faster.
  const [parsing, setParsing] = useState(false);
  // If `onText()`'s own parsing fails, `importFromText()` sets `parseError` and leaves the wizard on
  // this same 'upload' step (never advances to Accounts) — derived (not reset via an effect) so
  // `parsing` never stays stuck true with no way back to the upload UI short of leaving the screen.
  const showParsing = parsing && !parseError;

  async function pickFile() {
    try {
      // RN Web: mixing a specific MIME type with '*/*' greys out the file in the browser's native
      // dialog (see BackupPage.tsx's pickFile() for the same fix) — '*/*' alone is reliable there.
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web' ? '*/*' : ['text/csv', '*/*'],
        copyToCacheDirectory: true
      });
      if (result.canceled || !result.assets?.[0]) return;
      // expo-file-system's web build is a no-op stub, so `new File(uri)` throws on RN Web — use the
      // picker asset's own browser File object instead there (see AccountRecoveryScreen.tsx's same fix).
      const asset = result.assets[0];
      const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      setParsing(true);
      setTimeout(() => onText(text), 0);
    } catch {
      // Never let a picker/native-file-read hiccup throw uncaught (2026-08-13) — same `parseError`
      // banner every other unreadable-file case already uses. See `ErrorBoundary.tsx`'s doc comment.
      onError("Couldn't read that file. Try picking it again.");
    }
  }

  if (showParsing) {
    return (
      <View className="flex-1 items-center justify-center gap-3 py-16">
        <PennyLoader size="lg" />
        <Text className="text-sm text-secondary">Reading your file…</Text>
      </View>
    );
  }

  return (
    <>
      <View className="gap-2">
        <SectionLabel>Format</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          {[...IMPORT_FORMATS, 'custom' as const].map((f) => (
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

      {/* Temporary — see ImportCleanupPanel's doc comment */}
      <Button variant="ghost" size="sm" icon="ti-trash" onPress={() => setCleanupOpen(true)}>
        Clean up unused categories &amp; accounts
      </Button>
      {cleanupOpen && <ImportCleanupPanel onClose={() => setCleanupOpen(false)} />}
    </>
  );
}
