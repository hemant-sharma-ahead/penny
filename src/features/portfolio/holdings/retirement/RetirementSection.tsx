import { useState } from 'react';
import type { Holding } from '@/core/db/types';
import { RetirementCard, RetirementUntrackedCard } from './RetirementCard';
import { NpsScheduleSheet } from './RetirementSheets';
import { NpsModal } from './NpsModal';
import { PpfModal } from './PpfModal';
import { EpfModal } from './EpfModal';

type RetClass = 'nps' | 'ppf' | 'epf';

interface RetirementSectionProps {
  holdings: Holding[];
  mode: string;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Retirement slice: always shows the three fixed NPS / PPF / EPF cards (tracked or
// untracked) and owns its add/edit modals plus the NPS lifecycle-schedule sheet.
export function RetirementSection({ holdings, mode, onSave, onRemove }: RetirementSectionProps) {
  const [form, setForm] = useState<{ ac: RetClass; editing: Holding | null } | null>(null);
  const [scheduleHolding, setScheduleHolding] = useState<Holding | null>(null);

  const close = () => setForm(null);
  const save = async (h: Holding) => {
    await onSave(h);
    close();
  };
  const del = (id: string) => {
    void onRemove(id).then(close);
  };

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {(['nps', 'ppf', 'epf'] as const).map((ac) => {
        const h = holdings.find((x) => x.assetClass === ac);
        return h ? (
          <RetirementCard
            key={h.id}
            holding={h}
            onEdit={() => setForm({ ac, editing: h })}
            onSave={onSave}
            onViewSchedule={() => setScheduleHolding(h)}
            mode={mode}
          />
        ) : (
          <RetirementUntrackedCard key={ac} type={ac} onTrack={() => setForm({ ac, editing: null })} />
        );
      })}

      {form?.ac === 'nps' && <NpsModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'ppf' && <PpfModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'epf' && <EpfModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}

      {scheduleHolding && <NpsScheduleSheet holding={scheduleHolding} onClose={() => setScheduleHolding(null)} />}
    </div>
  );
}
