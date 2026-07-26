import { useState } from 'react';
import { EmptyState } from '@/components/ui';
import type { Holding } from '@/core/db/types';
import { FdCard } from './FdCard';
import { RdCard } from './RdCard';
import { FdModal } from './FdModal';

interface FixedIncomeSectionProps {
  holdings: Holding[];
  masked: boolean;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Fixed Income (FD/RD) slice: renders the cards and owns its own add/edit modal.
export function FixedIncomeSection({ holdings, masked, onSave, onRemove }: FixedIncomeSectionProps) {
  // null = closed; { editing: null } = adding; { editing: h } = editing.
  const [form, setForm] = useState<{ editing: Holding | null } | null>(null);

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {holdings.length === 0 ? (
        <EmptyState
          icon="ti-building-bank"
          title="No FDs or RDs yet"
          description="Tap + to track your fixed deposits."
        />
      ) : (
        holdings.map((h) =>
          h.assetMeta?.fdSubType === 'rd' ? (
            <RdCard key={h.id} holding={h} onEdit={() => setForm({ editing: h })} masked={masked} />
          ) : (
            <FdCard key={h.id} holding={h} onEdit={() => setForm({ editing: h })} masked={masked} />
          )
        )
      )}
      <button
        onClick={() => setForm({ editing: null })}
        className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-theme text-sm font-medium text-tertiary"
      >
        <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true" />
        Add FD / RD
      </button>

      {form && (
        <FdModal
          editing={form.editing}
          onSave={async (h) => {
            await onSave(h);
            setForm(null);
          }}
          onDelete={(id) => {
            void onRemove(id).then(() => setForm(null));
          }}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
