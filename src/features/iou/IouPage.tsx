import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import type { PersonalIou } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { Button, PageHeader } from '@/components/ui';
import { useIou } from './useIou';
import { IouListView } from './IouListView';
import { IouForm } from './IouForm';

export function IouPage() {
  const { mode } = usePrivacy();
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
    <div className="flex flex-col h-full">
      <PageHeader title="IOUs">
        {iouActive.length > 0 && (
          <div className="flex gap-3 mt-1">
            {iouTotalLent > 0 && (
              <span className="text-xs font-medium text-success">
                You&apos;re owed {mode === 'open' ? formatCurrency(iouTotalLent) : '••••'}
              </span>
            )}
            {iouTotalLent > 0 && iouTotalBorrowed > 0 && (
              <span className="text-xs" style={{ color: 'var(--color-border-strong)' }}>
                ·
              </span>
            )}
            {iouTotalBorrowed > 0 && (
              <span className="text-xs font-medium text-danger">
                You owe {mode === 'open' ? formatCurrency(iouTotalBorrowed) : '••••'}
              </span>
            )}
          </div>
        )}
      </PageHeader>

      <div className="flex-1 overflow-y-auto pb-24">
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
          onSave={async (iou) => {
            await saveIou(iou);
            setShowForm(false);
          }}
          onDelete={async (id) => {
            await removeIou(id);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
          nowMs={nowMs}
        />
      )}
    </div>
  );
}
