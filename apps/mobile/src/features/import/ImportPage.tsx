import { useCallback, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
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
 * to fall back into) or steps back one wizard stage (mapColumns/review) — the global header's
 * back-chevron (`MainTabs`' `HeaderLeft`, since the 2026-08-01 chrome consolidation) now needs the same
 * branch: `useRegisterHeaderScreen` below registers `navigation.goBack()` (popping this single pushed
 * screen back to ExpensesMain — equivalent to web's "navigate to Expenses" since Import has exactly one
 * entry point) when there's no earlier step, or `imp.setStep(target)` otherwise.
 */
export function ImportPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const imp = useImport();
  const [retrying, setRetrying] = useState(false);
  // Destructured out so `stepBack` below can depend on the stable setter directly (from `useState`)
  // instead of the whole `imp` object — `useImport()` returns a fresh object literal every render, so
  // depending on `imp` itself defeated memoization entirely: `stepBack` was a new function every
  // render, which kept re-firing `useRegisterHeaderScreen`'s internal `useFocusEffect` (its own
  // `backHandler` dependency never stabilized either), calling `setScreen` every render and looping
  // forever — the "Maximum update depth exceeded" crash, reproducible on any CSV import regardless of
  // file size (found 2026-08-06). Same fix as `BankImportPage.tsx`'s identical bug.
  const { setStep } = imp;

  const backTarget: Record<typeof imp.step, typeof imp.step | null> = {
    upload: null,
    mapColumns: 'upload',
    review: imp.format === 'custom' ? 'mapColumns' : 'upload',
    done: null
  };
  const target = backTarget[imp.step];
  const stepBack = useCallback(() => {
    if (target) setStep(target);
  }, [target, setStep]);
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  useRegisterHeaderScreen('Import', target ? stepBack : goBack);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      {imp.step === 'review' ? (
        // Its own flex-1 layout (fixed progress summary + internally-scrolling accordion body) — see
        // ReviewStep.tsx's doc comment for why this can't share the plain ScrollView the other steps use.
        <ReviewStep
          parsedRows={imp.parsedRows}
          rejectedRows={imp.rejectedRows}
          carryForwardExcludedRows={imp.carryForwardExcludedRows}
          mapping={imp.mapping}
          header={imp.header}
          categoryResolutions={imp.categoryResolutions}
          accountResolutions={imp.accountResolutions}
          noAccountColumn={imp.noAccountColumn}
          singleAccountId={imp.singleAccountId}
          setSingleAccountId={imp.setSingleAccountId}
          singleAccountCreate={imp.singleAccountCreate}
          setSingleAccountCreate={imp.setSingleAccountCreate}
          categories={imp.categories}
          accounts={imp.accounts}
          txnCountByCategory={imp.txnCountByCategory}
          categoriesLoadError={imp.categoriesLoadError}
          onRetryLoadCategories={imp.retryLoadReferenceData}
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
          rowOverrides={imp.rowOverrides}
          importing={imp.importing}
          onUpdateCategory={imp.updateCategoryResolution}
          onUpdateCategoryTag={imp.setCategoryTag}
          onMoveRowsToCategory={imp.moveRowsToCategory}
          onTagRows={imp.tagRows}
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
                onDone={() => navigation.goBack()}
              />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
