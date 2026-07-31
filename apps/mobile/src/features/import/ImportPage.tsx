import { useState } from 'react';
import { Pressable, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useImport } from './useImport';
import { UploadStep } from './UploadStep';
import { MapColumnsStep } from './MapColumnsStep';
import { ReviewStep } from './ReviewStep';
import { DoneStep } from './DoneStep';

/**
 * RN port of apps/web-react/src/features/import/ImportPage.tsx — full rebuild of the CSV import wizard
 * to match web's 2026-07-28 redesign (Resolve + Preview merged into one live "review" step, Custom
 * format's Map-columns step, retry/undo on the Done step). Only the UI layer changed here; every piece
 * of actual import logic (parsing, resolution, transfer-pairing, carry-forward handling, the DB writer)
 * lives unchanged in packages/core and is shared with useImport.ts.
 *
 * Web's back button either navigates to Expenses (upload/done steps, which have no earlier wizard step
 * to fall back into) or steps back one wizard stage (mapColumns/review) — mirrored here as: `BackButton`
 * (calls `navigation.goBack()`, popping this single pushed screen back to ExpensesMain — equivalent to
 * web's "navigate to Expenses" since Import has exactly one entry point) when there's no earlier step,
 * or a local `Pressable` that calls `imp.setStep(target)` otherwise.
 */
export function ImportPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const imp = useImport();
  const [retrying, setRetrying] = useState(false);

  const backTarget: Record<typeof imp.step, typeof imp.step | null> = {
    upload: null,
    mapColumns: 'upload',
    review: imp.format === 'custom' ? 'mapColumns' : 'upload',
    done: null
  };
  const target = backTarget[imp.step];

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        title="Import expenses"
        leading={
          target ? (
            <Pressable
              onPress={() => imp.setStep(target)}
              accessibilityLabel="Back"
              hitSlop={8}
              className="w-9 h-9 items-center justify-center rounded-full -ml-2"
            >
              <Icon name="ti-arrow-left" size={20} color={theme.textSecondary} />
            </Pressable>
          ) : (
            <BackButton />
          )
        }
      />

      {imp.step === 'review' ? (
        // Its own flex-1 layout (fixed progress summary + internally-scrolling accordion body) — see
        // ReviewStep.tsx's doc comment for why this can't share the plain ScrollView the other steps use.
        <ReviewStep
          parsedRows={imp.parsedRows}
          rejectedRows={imp.rejectedRows}
          carryForwardExcludedRows={imp.carryForwardExcludedRows}
          mapping={imp.mapping}
          categoryResolutions={imp.categoryResolutions}
          accountResolutions={imp.accountResolutions}
          noAccountColumn={imp.noAccountColumn}
          singleAccountId={imp.singleAccountId}
          setSingleAccountId={imp.setSingleAccountId}
          singleAccountCreate={imp.singleAccountCreate}
          setSingleAccountCreate={imp.setSingleAccountCreate}
          categories={imp.categories}
          accounts={imp.accounts}
          rowTriage={imp.rowTriage}
          totalRowsRead={imp.totalRowsRead}
          actualTransactionCount={imp.actualTransactionCount}
          readyCount={imp.readyCount}
          attentionCount={imp.attentionCount}
          duplicateCount={imp.duplicateCount}
          transferPairs={imp.transferPairs}
          accountsResolved={imp.accountsResolved}
          confirmedAccountCount={imp.confirmedAccountCount}
          categoriesDecidedCount={imp.categoriesDecidedCount}
          touchedCategorySources={imp.touchedCategorySources}
          categoryTags={imp.categoryTags}
          importing={imp.importing}
          onUpdateCategory={imp.updateCategoryResolution}
          onUpdateCategoryTag={imp.setCategoryTag}
          onUpdateAccount={imp.updateAccountResolution}
          onFixRejected={imp.fixRejectedRow}
          onImport={() => void imp.commitAndImport()}
        />
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 px-4 py-4 gap-4">
            {imp.step === 'upload' && (
              <UploadStep
                format={imp.format}
                setFormat={imp.setFormat}
                parseError={imp.parseError}
                onText={imp.importFromText}
              />
            )}

            {imp.step === 'mapColumns' && imp.mapping && (
              <MapColumnsStep
                header={imp.header}
                mapping={imp.mapping}
                onConfirm={imp.confirmMapping}
                onBack={() => imp.setStep('upload')}
              />
            )}

            {imp.step === 'done' && (
              <DoneStep
                succeededCount={imp.importResult.succeededCount}
                failed={imp.importResult.failed}
                activityLogId={imp.activityLogId}
                undone={imp.undone}
                retrying={retrying}
                onRetryFailed={() => {
                  setRetrying(true);
                  void imp.retryFailed().finally(() => setRetrying(false));
                }}
                onUndo={imp.undoImport}
                onDone={() => navigation.navigate('Expenses')}
              />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
