import { useState, useEffect } from 'react';
import { EmptyState } from '@/components/ui';
import { fetchMetalPrices } from '@/core/metals/metalsClient';
import type { Holding } from '@/core/db/types';
import { PreciousMetalCard } from './PreciousMetalCard';
import { GoldModal } from './GoldModal';

interface PreciousMetalsSectionProps {
  holdings: Holding[];
  mode: string;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Precious metals slice: fetches live spot prices, renders gold/silver cards, and
// owns its own add/edit modal.
export function PreciousMetalsSection({ holdings, mode, onSave, onRemove }: PreciousMetalsSectionProps) {
  const [spotGold, setSpotGold] = useState<number | null>(null);
  const [spotSilver, setSpotSilver] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ editing: Holding | null } | null>(null);

  useEffect(() => {
    fetchMetalPrices()
      .then(({ gold, silver }) => {
        setSpotGold(gold);
        setSpotSilver(silver);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {holdings.length === 0 ? (
        <EmptyState
          icon="ti-coin"
          title="No precious metal holdings yet"
          description="Tap + to track gold or silver."
        />
      ) : (
        <>
          {loading && <p className="text-[10px] text-center text-tertiary">Fetching live prices…</p>}
          {holdings.map((h) => (
            <PreciousMetalCard
              key={h.id}
              holding={h}
              spotGold={spotGold}
              spotSilver={spotSilver}
              onEdit={() => setForm({ editing: h })}
              mode={mode}
            />
          ))}
        </>
      )}
      <button
        onClick={() => setForm({ editing: null })}
        className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-theme text-sm font-medium text-tertiary"
      >
        <i className="ti ti-plus" style={{ fontSize: 16 }} aria-hidden="true" />
        Add Gold / Silver
      </button>

      {form && (
        <GoldModal
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
