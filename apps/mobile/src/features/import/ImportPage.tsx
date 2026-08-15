import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import { useToast } from '~/context/ToastContext';
import { ErrorBoundary } from '~/components/shared/ErrorBoundary';
import type { ExpensesStackParamList } from '~/navigation/ExpensesStack';
import { useImport } from './useImport';
import { UploadStep } from './UploadStep';
import { MapColumnsStep } from './MapColumnsStep';
import { AccountsStage } from './AccountsStage';
import { CategoriesStage } from './CategoriesStage';
import { TransactionsStage } from './TransactionsStage';
import { ImportProgressStep } from './ImportProgressStep';
import { WizardProgress } from './WizardProgress';

/**
 * RN port of apps/web-react/src/features/import/ImportPage.tsx, rebuilt for the 2026-08-14 CSV-import
 * redesign's full 6-stage flow (docs/plans/csv-expense-import-redesign.md §3):
 * Upload → MapColumns → Accounts → Categories → Transactions → Done. Every piece of actual import logic
 * (parsing, resolution, transfer-pairing, carry-forward handling, the DB writer) lives in packages/core
 * and is shared with `useImport.ts`; this file owns only step orchestration + the cross-stage
 * `WizardProgress` chrome (§3.1).
 *
 * Web's back button either navigates to Expenses (upload/done steps, which have no earlier wizard step
 * to fall back into) or steps back one wizard stage — the global header's back-chevron
 * (`useRegisterHeaderScreen`) mirrors that: `navigation.goBack()` when there's no earlier step, or
 * `imp.setStep(target)` otherwise, via the `backTarget` lookup below.
 */
export function ImportPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ExpensesStackParamList, 'Import'>>();
  const route = useRoute<RouteProp<ExpensesStackParamList, 'Import'>>();
  const { showToast } = useToast();
  const imp = useImport();
  const [retrying, setRetrying] = useState(false);

  // Bank Import handoff toast (docs/mockups/proposals/bank-import-expense-first-nudge-v1.html) — set
  // only when this screen was reached via `ExpenseCoverageNudge.tsx`'s "Go log expenses first" button.
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
  // instead of the whole `imp` object — see the 2026-08-06 "Maximum update depth exceeded" fix this
  // guards against (BankImportPage.tsx's identical bug).
  const { setStep } = imp;

  const backTarget: Record<typeof imp.step, typeof imp.step | null> = {
    upload: null,
    mapColumns: 'upload',
    accounts: imp.format === 'custom' ? 'mapColumns' : 'upload',
    categories: 'accounts',
    transactions: 'categories',
    done: null
  };
  const target = backTarget[imp.step];
  const stepBack = useCallback(() => {
    if (target) setStep(target);
  }, [target, setStep]);
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const backToTransactions = useCallback(() => setStep('transactions'), [setStep]);

  // Import Progress screen (2026-08-14, redesign §14 item 8) — 'done' step's own back-navigation
  // behavior depends on its internal `importPhase`, not just `step` (unlike every other stage): Pre-start
  // steps back to Transactions (nothing written yet, completely safe — same as any other mid-flow
  // stage), Importing has NO back handler at all (locked — see the `chromeLocked`/`BackHandler`/
  // `gestureEnabled` wiring below, all keyed off the same `isImporting`), Complete goes back to leaving
  // the wizard entirely (today's existing Done behavior, unchanged).
  const isImporting = imp.step === 'done' && imp.importPhase === 'importing';
  const doneBackHandler =
    imp.importPhase === 'preStart' ? backToTransactions : imp.importPhase === 'importing' ? null : goBack;
  const headerBackHandler = imp.step === 'done' ? doneBackHandler : target ? stepBack : goBack;
  useRegisterHeaderScreen('Import', headerBackHandler, isImporting);

  // Android hardware back + swipe-back gesture (2026-08-14) — the header's back-chevron alone isn't
  // enough; `HeaderBackChevron` is a plain in-JS `Pressable`, not react-navigation's own native header
  // back button, so it has no effect on either of these. `gestureEnabled` is wired via a route param
  // (`ExpensesStack.tsx`'s `Import` screen options read it) since native-stack's per-screen options are
  // only settable that way from inside the screen itself — same pattern `ChangePinPage.tsx` already
  // uses for its own forced-PIN-reset lock (`forcedPinReset` route param).
  useEffect(() => {
    navigation.setParams({ importLocked: isImporting });
  }, [isImporting, navigation]);
  useEffect(() => {
    if (!isImporting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [isImporting]);

  // Cross-stage wizard chrome (§3.1) — 5 segments for a known format (MapColumns skipped), 6 for
  // Custom (MapColumns included), same conditional MapColumns skip ImportPage already has today.
  const stepSequence = useMemo<(typeof imp.step)[]>(
    () =>
      imp.format === 'custom'
        ? ['upload', 'mapColumns', 'accounts', 'categories', 'transactions', 'done']
        : ['upload', 'accounts', 'categories', 'transactions', 'done'],
    [imp.format]
  );
  const stepIndex = stepSequence.indexOf(imp.step);
  const totalSteps = stepSequence.length;
  const stepLabels: Record<typeof imp.step, string> = {
    upload: 'Upload',
    mapColumns: 'Map columns',
    accounts: 'Accounts',
    categories: 'Categories',
    transactions: 'Transactions',
    done: 'Done'
  };
  const stepCountLabel: Record<typeof imp.step, string | undefined> = {
    upload: undefined,
    mapColumns: undefined,
    accounts: `${imp.accountResolutions.length || 1} source account${imp.accountResolutions.length === 1 ? '' : 's'}`,
    categories: `${imp.categoryRowGroups.length} categories`,
    transactions: `${imp.totalRowsRead} rows`,
    done: undefined
  };
  const showWizardChrome = imp.step !== 'upload' && imp.step !== 'done';
  const showDraftBadge = imp.step !== 'upload' && imp.step !== 'done';

  const excludeAccountId = imp.noAccountColumn ? (imp.singleAccountId ?? undefined) : undefined;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      {/* Screen-scoped safety net (2026-08-13) — a bad/unexpected file is the single most likely place
          for a rendering surprise, so a reset here steps back to Upload (a sane, recoverable state)
          instead of just clearing the error and re-rendering the same still-broken data. */}
      <ErrorBoundary message="This import couldn't be shown" onReset={() => imp.setStep('upload')}>
        <View className="flex-1">
          {showWizardChrome && (
            <WizardProgress
              stepIndex={stepIndex}
              totalSteps={totalSteps}
              stepLabel={stepLabels[imp.step]}
              countLabel={stepCountLabel[imp.step]}
              showDraftBadge={showDraftBadge}
            />
          )}

          {imp.step === 'accounts' ? (
            <AccountsStage
              accountResolutions={imp.accountResolutions}
              accounts={imp.accounts}
              noAccountColumn={imp.noAccountColumn}
              singleAccountId={imp.singleAccountId}
              setSingleAccountId={imp.setSingleAccountId}
              singleAccountCreate={imp.singleAccountCreate}
              setSingleAccountCreate={imp.setSingleAccountCreate}
              onUpdateAccount={imp.updateAccountResolution}
              parsedRows={imp.parsedRows}
              rowTriage={imp.rowTriage}
              cardMergeSuggestions={imp.cardMergeSuggestions}
              onAcceptCardMerge={imp.acceptCardAccountMerge}
              onDismissCardMerge={imp.dismissCardAccountMerge}
              cardMergeTargets={imp.cardMergeTargets}
              onUnmergeCardAccount={imp.unmergeCardAccount}
              accountTouchedSourceNames={imp.accountTouchedSourceNames}
              onAcknowledgeAccount={imp.acknowledgeAccountResolution}
              accountsResolved={imp.accountsResolved}
              confirmedAccountCount={imp.confirmedAccountCount}
              onNext={() => imp.setStep('categories')}
            />
          ) : imp.step === 'categories' ? (
            <CategoriesStage
              rowGroups={imp.transactionsRowGroups}
              categories={imp.categories}
              accounts={imp.accounts}
              excludeAccountId={excludeAccountId}
              txnCountByCategory={imp.txnCountByCategory}
              categoryTagsByKey={imp.categoryTagsByKey}
              rememberedSuggestions={imp.rememberedSuggestions}
              decidedCount={imp.categoriesDecidedCount}
              allDecided={imp.categoriesAllDecided}
              onUpdate={imp.updateCategoryDecision}
              onTagChange={imp.setCategoryTagForKey}
              onAcknowledge={imp.acknowledgeCategoryDecision}
              onMoveToResidual={imp.moveCounterpartyGroupToResidual}
              onNext={() => imp.setStep('transactions')}
            />
          ) : imp.step === 'transactions' ? (
            <TransactionsStage
              rejectedRows={imp.rejectedRows}
              mapping={imp.mapping}
              header={imp.header}
              onFixRejected={imp.fixRejectedRow}
              onDiscardRejected={imp.discardRejectedRow}
              carryForwardExcludedRows={imp.carryForwardExcludedRows}
              transferPairs={imp.transferPairs}
              onUnpairTransfer={imp.unpairTransfer}
              rowGroups={imp.transactionsRowGroups}
              grouping={imp.transactionsGrouping}
              preview={imp.preview}
              expenseById={imp.expenseById}
              categories={imp.categories}
              accounts={imp.accounts}
              persons={imp.persons}
              excludeAccountId={excludeAccountId}
              txnCountByCategory={imp.txnCountByCategory}
              categoryTagsByKey={imp.categoryTagsByKey}
              rowOverrides={imp.rowOverrides}
              iouPersonNames={imp.iouPersonNames}
              rowIouPersonNames={imp.rowIouPersonNames}
              rememberedSuggestions={imp.rememberedSuggestions}
              attentionCount={imp.attentionCount}
              readyCount={imp.readyCount}
              duplicateCount={imp.duplicateCount}
              skippedCount={imp.skippedCount}
              stagedRowCount={imp.stagedRowCount}
              actualTransactionCount={imp.actualTransactionCount}
              totalRowsRead={imp.totalRowsRead}
              onUpdate={imp.updateCategoryDecision}
              onTagChange={imp.setCategoryTagForKey}
              onAcknowledge={imp.acknowledgeCategoryDecision}
              onIouPersonNameChange={imp.setIouPersonNameForKey}
              onSetRowIouPersonNames={imp.setRowIouPersonNames}
              onMoveRowsToCategory={imp.moveRowsToCategory}
              onTagRows={imp.tagRows}
              onNotADuplicate={imp.unflagDuplicate}
              onImport={imp.enterImportProgress}
            />
          ) : imp.step === 'done' ? (
            <ImportProgressStep
              phase={imp.importPhase}
              totalTransactionCount={imp.actualTransactionCount}
              progress={imp.importProgress}
              startedAt={imp.importStartedAt}
              onStartImport={() => void imp.commitAndImport()}
              onRequestCancel={imp.requestCancelImport}
              succeededCount={imp.importResult.succeededCount}
              failed={imp.importResult.failed}
              activityLogId={imp.activityLogId}
              undone={imp.undone}
              retrying={retrying}
              discardedCount={imp.doneSummary.discardedCount}
              stillUnresolvedCount={imp.doneSummary.stillUnresolvedCount}
              accountSkippedCount={imp.doneSummary.accountSkippedCount}
              cancelled={imp.importCancelled}
              cancelledRemainingCount={imp.cancelledRemainingCount}
              importError={imp.importError}
              onRetryFailed={() => {
                setRetrying(true);
                void imp.retryFailed().finally(() => setRetrying(false));
              }}
              onUndo={imp.undoImport}
              onDone={() => navigation.goBack()}
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
              </View>
            </ScrollView>
          )}
        </View>
      </ErrorBoundary>
    </SafeAreaView>
  );
}
