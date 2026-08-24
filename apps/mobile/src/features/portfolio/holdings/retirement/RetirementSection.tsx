import { useState } from 'react';
import { View } from 'react-native';
import type { EmploymentType, Holding } from '@/core/db/types';
import { useProfile } from '@/hooks/useProfile';
import { epfBuildCardData } from '@/core/portfolio/epfCalculations';
import { ppfCurrentBalance } from '@/core/portfolio/ppfCalculations';
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

  // EPF is the one asset class whose value is never entered directly (unlike PPF/NPS's "Current
  // corpus" field, or a mutual fund's live NAV × units) — it's entirely derived from the employer/
  // transaction ledger via `epfBuildCardData`. That derived corpus was never actually being persisted
  // onto `holding.currentValue`, so net worth's `h.currentValue ?? h.investedAmount` convention
  // (`useHome.ts`, `calcInvestableCorpus`, `usePortfolioHoldings.ts` — all asset-class-agnostic, none
  // of them call `epfBuildCardData` themselves) silently read `0` for every EPF holding, dropping it
  // from both the net-worth total and the breakdown's `> 0` filter entirely. Fixed at this single
  // choke point — every EPF save in this whole feature (`RetirementCard.tsx`, `EpfImportFlow.tsx`,
  // `EpfModal.tsx`, and everything nested under them) already flows through this one `onSave` prop —
  // rather than special-casing every individual save call site, matching the same "write the derived
  // value back on save" pattern `usePortfolioHoldings.ts`'s own `refreshPrices()` already uses for a
  // live-priced MF/stock holding's `currentValue`.
  const saveHolding = async (h: Holding) => {
    if (h.assetClass === 'epf') {
      await onSave({ ...h, currentValue: epfBuildCardData(h.assetMeta ?? {}).corpus });
      return;
    }
    // Same real bug, same fix, one asset class over (2026-08-24): PPF's `investedAmount` is a
    // separately-stored snapshot (set once at import, or whatever it last happened to be), never
    // recomputed when a deposit/interest/withdrawal is later added, edited, or deleted — so the
    // card's own header figure, and net worth's `h.currentValue ?? h.investedAmount` reading of it,
    // both silently went stale after any transaction change. Every PPF save (add/edit via
    // `PpfTransactionSheet`, delete via `PpfAllTransactionsSheet`, a fresh statement import via
    // `PpfImportFlow`) already flows through this one `onSave` prop, so fixing it here covers all of
    // them at once, exactly like EPF's `currentValue` fix above.
    if (h.assetClass === 'ppf') {
      await onSave({ ...h, investedAmount: ppfCurrentBalance(h.assetMeta?.ppfTransactions ?? []) });
      return;
    }
    await onSave(h);
  };

  const close = () => setForm(null);
  const save = async (h: Holding) => {
    await saveHolding(h);
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
              onSave={saveHolding}
              onViewSchedule={() => setScheduleHolding(h)}
              masked={masked}
            />
          );
        }
        // No holding yet — suppress the EPF prompt for employment types that don't have EPF.
        if (ac === 'epf' && hideEpfPrompt) return null;
        return (
          <RetirementUntrackedCard
            key={ac}
            type={ac}
            onTrack={() => setForm({ ac, editing: null })}
            {...((ac === 'epf' || ac === 'ppf') && { onSave: saveHolding })}
          />
        );
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
