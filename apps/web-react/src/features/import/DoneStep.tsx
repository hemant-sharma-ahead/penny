import { useState } from 'react';
import { Button } from '@/components/ui';
import { STATUS, tint } from '@/lib/statusColors';
import type { FailedImportRow } from '@/core/import/importWriter';

interface DoneStepProps {
  succeededCount: number;
  failed: FailedImportRow[];
  activityLogId: string | null;
  undone: boolean;
  retrying: boolean;
  onRetryFailed: () => void;
  onUndo: () => Promise<void>;
  onDone: () => void;
}

export function DoneStep({
  succeededCount,
  failed,
  activityLogId,
  undone,
  retrying,
  onRetryFailed,
  onUndo,
  onDone
}: DoneStepProps) {
  const [undoing, setUndoing] = useState(false);

  if (undone) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 flex-1 py-12">
        <p className="text-lg font-semibold text-primary">Import undone</p>
        <p className="text-sm text-secondary text-center">The imported transactions were removed.</p>
        <Button variant="primary" fullWidth onClick={onDone}>
          Go to Expenses
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 flex-1 py-12 px-2">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ backgroundColor: tint(failed.length > 0 ? STATUS.warning : STATUS.success) }}
      >
        <i
          className={`ti ${failed.length > 0 ? 'ti-alert-triangle' : 'ti-check'}`}
          style={{ fontSize: 32, color: failed.length > 0 ? STATUS.warning : STATUS.success }}
          aria-hidden="true"
        />
      </div>
      <div className="text-center">
        <p className="text-xl font-semibold text-primary">
          {failed.length > 0 ? 'Import partially complete' : 'Import complete'}
        </p>
        <p className="text-sm text-secondary mt-1">
          {succeededCount} expense{succeededCount !== 1 ? 's' : ''} added to your vault
          {failed.length > 0 && ` · ${failed.length} row${failed.length !== 1 ? 's' : ''} failed`}
        </p>
      </div>

      {failed.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          <p className="text-xs text-danger text-center">
            {failed.length} row{failed.length !== 1 ? 's' : ''} couldn't be saved (e.g. a transient encryption error).
            The rest are already in your vault — you can retry just the failed ones.
          </p>
          <Button variant="secondary" fullWidth loading={retrying} onClick={onRetryFailed}>
            Retry {failed.length} failed row{failed.length !== 1 ? 's' : ''}
          </Button>
        </div>
      )}

      <div className="w-full flex flex-col gap-2">
        <Button variant="primary" fullWidth onClick={onDone}>
          Go to Expenses
        </Button>
        {activityLogId && succeededCount > 0 && (
          <Button
            variant="ghost"
            fullWidth
            loading={undoing}
            onClick={async () => {
              setUndoing(true);
              await onUndo();
              setUndoing(false);
            }}
          >
            Undo this import
          </Button>
        )}
      </div>
    </div>
  );
}
