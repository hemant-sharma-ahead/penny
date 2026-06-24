import { Button } from '@/components/ui';

interface DoneStepProps {
  importedCount: number;
  onDone: () => void;
}

export function DoneStep({ importedCount, onDone }: DoneStepProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 flex-1 py-12">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10b98120' }}>
        <i className="ti ti-check" style={{ fontSize: 32, color: '#10b981' }} aria-hidden="true" />
      </div>
      <div className="text-center">
        <p className="text-xl font-semibold text-primary">Import complete</p>
        <p className="text-sm text-secondary mt-1">
          {importedCount} expense{importedCount !== 1 ? 's' : ''} added to your vault
        </p>
      </div>
      <Button variant="primary" fullWidth onClick={onDone}>
        Go to Expenses
      </Button>
    </div>
  );
}
