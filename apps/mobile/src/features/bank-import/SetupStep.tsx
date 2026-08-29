import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Banner, Button, Card, SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { BankPickerModal, type BankPickerOption } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatDate } from '@/lib/date';
import { CUSTOM_PRESET_ID } from '@/core/bank-import/presets';
import type { BankPresetId } from '@/core/bank-import/types';
import type { UseBankImportReturn } from './useBankImport';
import { MappingEditModal } from './MappingEditModal';
import { OpeningBalancePrompt } from './OpeningBalancePrompt';
import { ExpenseCoverageNudge } from './ExpenseCoverageNudge';

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
  const [showBankPicker, setShowBankPicker] = useState(false);

  const bankOptions: BankPickerOption[] = [
    ...bi.banks.map((b) => ({ value: b.id, label: b.label, bankId: b.id as BankPresetId })),
    { value: CUSTOM_PRESET_ID, label: 'Other / Custom', pinLast: true }
  ];
  const bankLabel = bi.isCustomPreset
    ? 'your custom format'
    : (bi.banks.find((b) => b.id === bi.presetId)?.label ?? 'your bank');

  /** Excel support (2026-08-05, issue #4) — extension-based, not mimeType-based: some Android
   *  content-provider URIs report a generic `application/octet-stream` regardless of real file type,
   *  while the picked file's own name is always reliable. Anything not recognized as Excel falls back
   *  to the original CSV/plain-text path unchanged. */
  function isExcelFile(name: string): boolean {
    return /\.xlsx?$/i.test(name);
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type:
        Platform.OS === 'web'
          ? '*/*'
          : [
              'text/csv',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              '*/*'
            ],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (isExcelFile(asset.name)) {
      const bytes =
        Platform.OS === 'web' && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : await new File(asset.uri).bytes();
      bi.importFromXlsx(bytes, asset.name);
      return;
    }
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
        <Pressable
          onPress={() => setShowBankPicker(true)}
          className="flex-row items-center justify-between rounded-xl border px-3 py-2.5"
          style={{ borderColor: theme.border }}
        >
          <Text className={bi.presetId !== null ? 'text-sm text-primary' : 'text-sm text-tertiary'}>
            {bi.presetId !== null ? bankLabel : 'Select your bank'}
          </Text>
          <Icon name="ti-chevron-down" size={14} color={theme.textTertiary} />
        </Pressable>
        {showBankPicker && (
          <BankPickerModal
            options={bankOptions}
            value={bi.presetId ?? ''}
            onSelect={(v) => bi.selectPreset(v as BankPresetId)}
            onClose={() => setShowBankPicker(false)}
          />
        )}
      </View>

      {bi.presetId !== null && (
        <View className="gap-2">
          <SectionLabel className="mb-0">Statement file</SectionLabel>
          <Text className="text-xs text-tertiary -mt-1">
            Upload a CSV or Excel statement export from {bankLabel}. Delimiter and every column stay editable below.
          </Text>
          <Pressable
            onPress={() => void pickFile()}
            className="bg-surface rounded-xl p-8 items-center gap-3 border-2 border-dashed border-theme"
          >
            <Icon name="ti-file-upload" size={30} color={theme.textTertiary} />
            <Text className="text-sm text-secondary text-center">
              {bi.fileName || 'Tap to choose a CSV or Excel file'}
            </Text>
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
                <Text className="text-xs text-secondary">
                  {/* Shows the actually-in-effect date format right on the summary row (2026-08-05) —
                      previously only visible after tapping into "Edit mapping". */}
                  {key === 'date' ? `${label} (${bi.dateFormat})` : label}
                </Text>
                <Text className="text-xs font-medium text-primary">{bi.mapping[key] || '— Not mapped —'}</Text>
              </View>
            ))}
          </Card>
          {/* Was a single `text-xs text-tertiary` caption (2026-08-05 feedback: "too subtle to see",
              and a 0-row outcome looked visually identical to a healthy one — same tiny grey line,
              just different numbers, with no explanation of why). Now a real `Banner`: `info` when
              anything parsed (row count + date range as the bold headline, any rejected-row count as
              a plain detail line), `warning` when nothing did — surfacing the *first* row's actual
              rejection reason from `parseStatementRows` (`RejectedStatementRow.reason` — already
              computed, just never shown beyond an aggregate count before) and pointing at the date
              format specifically, since an unparseable-date mismatch is the overwhelmingly likely
              cause. */}
          {bi.mappingPreview &&
            (bi.mappingPreview.rows.length > 0 ? (
              <Banner
                variant="info"
                icon="ti-table"
                title={`${bi.mappingPreview.rows.length} row${bi.mappingPreview.rows.length === 1 ? '' : 's'} detected${
                  minDate !== null && maxDate !== null ? ` · ${formatDate(minDate)}–${formatDate(maxDate)}` : ''
                }`}
              >
                {bi.mappingPreview.rejected.length > 0
                  ? `${bi.mappingPreview.rejected.length} row${bi.mappingPreview.rejected.length === 1 ? '' : 's'} couldn't be read — first reason: ${bi.mappingPreview.rejected[0]?.reason}.`
                  : 'Every row in the file parsed cleanly.'}
              </Banner>
            ) : (
              <Banner variant="warning" icon="ti-alert-triangle" title="No rows could be read from this file">
                {bi.mappingPreview.rejected[0]?.reason
                  ? `Most likely cause: ${bi.mappingPreview.rejected[0].reason.toLowerCase()}. Check the date format above (${bi.dateFormat}) against how dates actually look in your file.`
                  : `Double-check the column mapping above, especially the date format (${bi.dateFormat}) — it should match how dates actually look in your file.`}
              </Banner>
            ))}
          {/* Gap-detection warning (docs/plans/bank-balance-sync.md §5/§11b) — compares this file's own
              date range against the account's prior covered ranges. Advisory only: "Continue to review"
              below proceeds regardless — a genuinely statement-free period (a dormant account) is a
              real possibility, not something to block on. */}
          {bi.coverageGap && (
            <Banner variant="warning" icon="ti-calendar-exclamation" title="Possible gap in your statement history">
              {`There's a gap between ${formatDate(bi.coverageGap.gapStart)} and ${formatDate(bi.coverageGap.gapEnd)} this account has no statement for — was that period genuinely empty, or is there a statement you haven't found yet?`}
            </Banner>
          )}
          {/* Opening-balance confirm (§10a) / anchor-shift (§14a/§14b) — docs/plans/
              bank-balance-sync.md §7 Stage 3 — vs. the expense-first nudge
              (docs/mockups/proposals/bank-import-expense-first-nudge-v1.html) below it. Both replace the
              plain "Continue to review" button entirely (never more than one of the three at once), so a
              single priority order is needed for the (rare, but real) case both trigger together — e.g. a
              first-ever bank-account import whose own period also has little/no logged expenses.
              Opening-balance/anchor-shift wins: it's a correctness-affecting data decision (what the
              account's own opening balance actually is) that every downstream balance/checkpoint
              computation depends on, not merely advisory — it must be resolved before anything else takes
              over this slot. The expense-coverage nudge is purely a recommendation, never a data decision,
              so it only gets the slot once there's no opening-balance flow pending. */}
          {bi.openingBalanceTrigger ? (
            <OpeningBalancePrompt bi={bi} />
          ) : bi.expenseCoverageWarning ? (
            <ExpenseCoverageNudge bi={bi} bankLabel={bankLabel} />
          ) : (
            // Was gated on `mappingReady` alone (every field mapped) — that says nothing about whether
            // the mapping actually *works*, so a wrong date format could map every field "correctly"
            // and still produce zero usable rows, yet still let the user proceed into an empty review
            // screen. Also requires at least one row having actually parsed. `bi.dataLoading` gate
            // added 2026-08-28 (real-device testing) — matching previously ran against whatever
            // `importRecords`/`allExpenses`/etc. happened to be loaded at that instant, so reaching
            // this button before those repos' first load resolved silently produced wrong match
            // results for a previously-imported statement (see `useBankImport.ts`'s own doc comment).
            <Button
              variant="primary"
              fullWidth
              loading={bi.dataLoading}
              disabled={!bi.mappingReady || bi.mappingPreview?.rows.length === 0}
              onPress={bi.confirmMapping}
            >
              {bi.dataLoading ? 'Loading…' : 'Continue to review'}
            </Button>
          )}
        </View>
      )}

      {showMappingEdit && <MappingEditModal bi={bi} onClose={() => setShowMappingEdit(false)} />}
    </View>
  );
}
