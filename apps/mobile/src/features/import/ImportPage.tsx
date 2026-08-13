import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type ParamListBase, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import { useToast } from '~/context/ToastContext';
import { ErrorBoundary } from '~/components/shared/ErrorBoundary';
import type { ExpensesStackParamList } from '~/navigation/ExpensesStack';
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
  const route = useRoute<RouteProp<ExpensesStackParamList, 'Import'>>();
  const { showToast } = useToast();
  const imp = useImport();
  const [retrying, setRetrying] = useState(false);

  // Bank Import handoff toast (docs/mockups/proposals/bank-import-expense-first-nudge-v1.html) — set
  // only when this screen was reached via `ExpenseCoverageNudge.tsx`'s "Go log expenses first" button.
  // `shownHandoffRef` "consumes" it after the first show: this component instance stays mounted for as
  // long as this screen stays on the Expenses stack, so without the ref a re-render (any of `imp`'s own
  // state changes) would re-run the effect's dependency check against the same still-truthy params and
  // never actually re-fire (dependency is unchanged) — the ref is what keeps a *genuinely new* handoff
  // (a fresh push with new params, after this instance was popped and recreated) working on its own,
  // with no need to explicitly clear navigation params back to undefined.
  const bankImportHandoff = route.params?.fromBankImport;
  const shownHandoffRef = useRef(false);
  useEffect(() => {
    if (bankImportHandoff && !shownHandoffRef.current) {
      shownHandoffRef.current = true;
      showToast({
        message: `Bank Import kept your progress — ${bankImportHandoff.bankName}, ${bankImportHandoff.fileName}. Come back anytime to continue.`,
        variant: 'info'
      });
    }
  }, [bankImportHandoff, showToast]);
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
      {/* Screen-scoped safety net (2026-08-13, see ErrorBoundary.tsx's own doc comment for the real
          on-device crash this was added after) — a bad/unexpected file is the single most likely place
          for a rendering surprise, so a reset here steps back to Upload (a sane, recoverable state)
          instead of just clearing the error and re-rendering the same still-broken review data. The
          app-level boundary in App.tsx is still there as a fallback if this one somehow isn't. */}
      <ErrorBoundary message="This import couldn't be shown" onReset={() => imp.setStep('upload')}>
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
            transfersResolved={imp.transfersResolved}
            categoriesDecidedCount={imp.categoriesDecidedCount}
            touchedCategorySources={imp.touchedCategorySources}
            categoryTags={imp.categoryTags}
            rowOverrides={imp.rowOverrides}
            rememberedSuggestions={imp.rememberedSuggestions}
            importing={imp.importing}
            onUpdateCategory={imp.updateCategoryResolution}
            onUpdateCategoryTag={imp.setCategoryTag}
            onMoveRowsToCategory={imp.moveRowsToCategory}
            onTagRows={imp.tagRows}
            onAcknowledgeCategory={imp.acknowledgeCategory}
            onUnpairTransfer={imp.unpairTransfer}
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
                  onError={imp.reportUploadError}
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
      </ErrorBoundary>
    </SafeAreaView>
  );
}
