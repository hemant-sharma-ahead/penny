import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader } from '@/components/ui';
import { PATHS } from '@/router/paths';
import { useImport } from './useImport';
import { UploadStep } from './UploadStep';
import { MapColumnsStep } from './MapColumnsStep';
import { ReviewStep } from './ReviewStep';
import { DoneStep } from './DoneStep';

export function ImportPage() {
  const navigate = useNavigate();
  const imp = useImport();
  const [retrying, setRetrying] = useState(false);

  const backTarget: Record<typeof imp.step, typeof imp.step | null> = {
    upload: null,
    mapColumns: 'upload',
    review: imp.format === 'custom' ? 'mapColumns' : 'upload',
    done: null
  };

  function handleBack() {
    const target = backTarget[imp.step];
    if (target) imp.setStep(target);
    else navigate(PATHS.app.expenses);
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Import expenses"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg"
            onClick={handleBack}
          />
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
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

        {imp.step === 'review' && (
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
            onDone={() => navigate(PATHS.app.expenses)}
          />
        )}
      </div>
    </div>
  );
}
