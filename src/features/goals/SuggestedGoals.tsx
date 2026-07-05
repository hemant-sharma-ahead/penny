import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useProfile } from '@/hooks/useProfile';
import { formatCompact } from '@/lib/formatters';
import { createGoalFromTemplate } from '@/core/advisor/guidance';
import { lifeStageGoalTemplates } from '@/core/advisor/lifeStageGoals';
import type { Goal } from '@/core/db/types';

/**
 * "Suggested for you" — life-stage goal templates from the opt-in profile (education corpus, home
 * down-payment, retirement…). One tap adds a `source:'suggested'` goal. Deduped against existing goals;
 * hidden when nothing new to suggest. Powered on-device by the profile — advice only.
 */
export function SuggestedGoals({ goals }: { goals: Goal[] }) {
  const { profile } = useProfile();
  const { showToast } = useToast();
  const [adding, setAdding] = useState<string | null>(null);

  const existing = new Set(goals.map((g) => g.name.trim().toLowerCase()));
  const templates = lifeStageGoalTemplates(profile).filter((t) => !existing.has(t.name.trim().toLowerCase()));
  if (templates.length === 0) return null;

  async function add(name: string) {
    const t = templates.find((x) => x.name === name);
    if (!t || adding) return;
    setAdding(name);
    try {
      await createGoalFromTemplate(t);
      showToast({ message: `Added "${t.name}" to your goals` });
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-theme p-3 mb-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary px-1 mb-1">Suggested for you</p>
      {templates.map((t, i) => (
        <div key={t.name} className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}>
          <span
            className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
              color: 'var(--color-primary)'
            }}
          >
            <i className={`ti ${t.icon ?? 'ti-target'}`} style={{ fontSize: 16 }} aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-primary truncate">{t.name}</span>
            <span className="block text-[11px] text-tertiary">Target ~{formatCompact(t.targetAmount)}</span>
          </span>
          <button
            type="button"
            onClick={() => void add(t.name)}
            disabled={adding !== null}
            className="flex-shrink-0 text-[11px] font-bold rounded-full px-3 py-1.5 text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {adding === t.name ? 'Adding…' : 'Add'}
          </button>
        </div>
      ))}
      <p className="text-[10px] text-tertiary px-1 mt-1.5">Based on your profile · edit amounts &amp; dates anytime.</p>
    </div>
  );
}
