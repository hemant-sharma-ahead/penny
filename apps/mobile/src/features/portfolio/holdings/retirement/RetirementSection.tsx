import { useState } from 'react';
import { View } from 'react-native';
import type { EmploymentType, Holding } from '@/core/db/types';
import { useProfile } from '@/hooks/useProfile';
import { RetirementCard, RetirementUntrackedCard } from './RetirementCard';
import { NpsScheduleSheet } from './RetirementSheets';
import { NpsModal } from './NpsModal';
import { PpfModal } from './PpfModal';
import { EpfModal } from './EpfModal';
import { CalculatorsSection } from '~/features/calculators/CalculatorsSection';

type RetClass = 'nps' | 'ppf' | 'epf';

// Employment types that typically have no EPF — hide the "Track EPF" prompt for them.
// (An existing EPF holding is always shown regardless, so data is never stranded.)
const NO_EPF_PROMPT = new Set<EmploymentType>(['self_employed', 'business_owner', 'student']);

interface RetirementSectionProps {
  holdings: Holding[];
  masked: boolean;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Retirement slice: always shows the three fixed NPS / PPF / EPF cards (tracked or
// untracked) and owns its add/edit modals plus the NPS lifecycle-schedule sheet.
export function RetirementSection({ holdings, masked, onSave, onRemove }: RetirementSectionProps) {
  const [form, setForm] = useState<{ ac: RetClass; editing: Holding | null } | null>(null);
  const [scheduleHolding, setScheduleHolding] = useState<Holding | null>(null);

  const { profile } = useProfile();
  const hideEpfPrompt = profile?.employmentType ? NO_EPF_PROMPT.has(profile.employmentType) : false;

  const close = () => setForm(null);
  const save = async (h: Holding) => {
    await onSave(h);
    close();
  };
  const del = (id: string) => {
    void onRemove(id).then(close);
  };

  return (
    <View className="px-4 py-3 gap-3">
      {(['nps', 'ppf', 'epf'] as const).map((ac) => {
        const h = holdings.find((x) => x.assetClass === ac);
        if (h) {
          return (
            <RetirementCard
              key={h.id}
              holding={h}
              onEdit={() => setForm({ ac, editing: h })}
              onSave={onSave}
              onViewSchedule={() => setScheduleHolding(h)}
              masked={masked}
            />
          );
        }
        // No holding yet — suppress the EPF prompt for employment types that don't have EPF.
        if (ac === 'epf' && hideEpfPrompt) return null;
        return <RetirementUntrackedCard key={ac} type={ac} onTrack={() => setForm({ ac, editing: null })} />;
      })}

      {/* Gratuity/SSY calculators — 2026-08-01 relocation out of Home's generic hub, into the
          retirement-benefit/govt-scheme context they're actually about. */}
      <CalculatorsSection ids={['gratuity', 'ssy']} />

      {form?.ac === 'nps' && <NpsModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'ppf' && <PpfModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'epf' && <EpfModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}

      {scheduleHolding && <NpsScheduleSheet holding={scheduleHolding} onClose={() => setScheduleHolding(null)} />}
    </View>
  );
}
