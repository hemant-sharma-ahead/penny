import { useState } from 'react';
import type { PersonalIou } from '@/core/db/types';
import { TabStrip } from '@/components/ui';
import { IouCard } from './IouCard';

interface IouListViewProps {
  /** Active IOUs, already sorted for display. */
  sortedActive: PersonalIou[];
  history: PersonalIou[];
  overdueCount: number;
  nowMs: number;
  mode: 'open' | 'safe' | 'privacy';
  onEdit: (iou: PersonalIou) => void;
  onSettle: (iou: PersonalIou) => void;
}

/** Shared IOU body: active/history sub-tabs, overdue banner, empty states, and card lists. */
export function IouListView({ sortedActive, history, overdueCount, nowMs, mode, onEdit, onSettle }: IouListViewProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  return (
    <>
      <TabStrip
        options={[
          { value: 'active', label: `Active (${sortedActive.length})` },
          { value: 'history', label: `History (${history.length})` }
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'active' && (
        <div className="px-4 py-4 flex flex-col gap-3">
          {overdueCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
              <i
                className="ti ti-alert-triangle text-red-500 flex-shrink-0 mt-0.5"
                style={{ fontSize: 16 }}
                aria-hidden="true"
              />
              <p className="text-xs text-red-700">
                {overdueCount} {overdueCount === 1 ? 'IOU is' : 'IOUs are'} overdue. Address{' '}
                {overdueCount === 1 ? 'it' : 'them'} to stay on top of things.
              </p>
            </div>
          )}
          {sortedActive.length === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-arrows-exchange text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm mt-3 text-tertiary">No active IOUs. Tap + to log one.</p>
            </div>
          ) : (
            sortedActive.map((iou) => (
              <IouCard key={iou.id} iou={iou} nowMs={nowMs} mode={mode} onEdit={onEdit} onSettle={onSettle} />
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="px-4 py-4 flex flex-col gap-3">
          {history.length === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-clock-check text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm mt-3 text-tertiary">No settled IOUs yet.</p>
            </div>
          ) : (
            history.map((iou) => <IouCard key={iou.id} iou={iou} nowMs={nowMs} mode={mode} onEdit={onEdit} />)
          )}
        </div>
      )}
    </>
  );
}
