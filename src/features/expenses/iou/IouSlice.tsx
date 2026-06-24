import { useState } from 'react';
import type { PersonalIou } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui';
import { useIou } from '@/features/iou/useIou';
import { IouListView } from '@/features/iou/IouListView';
import { IouForm } from '@/features/iou/IouForm';

interface IouSliceProps {
  mode: 'open' | 'safe' | 'privacy';
}

export function IouSlice({ mode }: IouSliceProps) {
  const {
    saveIou,
    removeIou,
    iouActive,
    iouHistory,
    iouSortedActive,
    iouTotalLent,
    iouTotalBorrowed,
    iouOverdueCount,
    nowMs
  } = useIou();
  const [showForm, setShowForm] = useState(false);
  const [editingIou, setEditingIou] = useState<PersonalIou | null>(null);

  function openAdd() {
    setEditingIou(null);
    setShowForm(true);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-24 flex flex-col">
        {/* Summary strip */}
        {iouActive.length > 0 && (
          <div className="flex gap-4 px-4 py-3 border-b border-theme">
            {iouTotalLent > 0 && (
              <span className="text-xs font-medium text-emerald-600">
                Owed to you: {mode === 'open' ? formatCurrency(iouTotalLent) : '••••'}
              </span>
            )}
            {iouTotalBorrowed > 0 && (
              <span className="text-xs font-medium text-red-500">
                You owe: {mode === 'open' ? formatCurrency(iouTotalBorrowed) : '••••'}
              </span>
            )}
          </div>
        )}

        <IouListView
          sortedActive={iouSortedActive}
          history={iouHistory}
          overdueCount={iouOverdueCount}
          nowMs={nowMs}
          mode={mode}
          onEdit={(iou) => {
            setEditingIou(iou);
            setShowForm(true);
          }}
          onSettle={(iou) => saveIou({ ...iou, isSettled: true, settledAt: nowMs, updatedAt: nowMs }).catch(() => {})}
        />
      </div>

      <Button
        variant="primary"
        icon="ti-plus"
        aria-label="Add IOU"
        className="fixed w-14 h-14 rounded-full shadow-lg z-10"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
        onClick={openAdd}
      />

      {showForm && (
        <IouForm
          editing={editingIou}
          onSave={async (iou: PersonalIou) => {
            await saveIou(iou);
            setShowForm(false);
          }}
          onDelete={async (id: string) => {
            await removeIou(id);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
          nowMs={nowMs}
        />
      )}
    </>
  );
}
