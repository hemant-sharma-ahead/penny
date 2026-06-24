import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { PATHS } from '@/router/paths';
import { useImport } from './useImport';
import { UploadStep } from './UploadStep';
import { PreviewStep } from './PreviewStep';
import { DoneStep } from './DoneStep';

export function ImportPage() {
  const navigate = useNavigate();
  const imp = useImport();

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme flex items-center gap-3">
        <Button
          variant="ghost"
          icon="ti-arrow-left"
          aria-label="Back"
          className="w-8 h-8 rounded-lg"
          onClick={() => (imp.step === 'upload' ? navigate(PATHS.app.expenses) : imp.setStep('upload'))}
        />
        <h2 className="text-xl font-semibold text-primary">Import expenses</h2>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
        {imp.step === 'upload' && (
          <UploadStep
            format={imp.format}
            setFormat={imp.setFormat}
            parseError={imp.parseError}
            onText={imp.importFromText}
          />
        )}

        {imp.step === 'preview' && (
          <PreviewStep
            preview={imp.preview}
            toImport={imp.toImport}
            unrecognisedCount={imp.unrecognisedCount}
            duplicateCount={imp.duplicateCount}
            importing={imp.importing}
            onBack={() => imp.setStep('upload')}
            onImport={() => void imp.runImport()}
          />
        )}

        {imp.step === 'done' && (
          <DoneStep importedCount={imp.importedCount} onDone={() => navigate(PATHS.app.expenses)} />
        )}
      </div>
    </div>
  );
}
