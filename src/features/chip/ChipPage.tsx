import { useEffect, useState } from 'react';
import { chipInsightsRepo } from '@/core/db/repositories';
import { DEFAULT_INSIGHTS } from '@/core/ai-safety/mockChip';
import type { ChipInsight } from '@/core/db/types';

async function seedInsightsIfEmpty(): Promise<ChipInsight[]> {
  const existing = await chipInsightsRepo.getAll();
  if (existing.length > 0) return existing;
  const now = Date.now();
  const seeded: ChipInsight[] = DEFAULT_INSIGHTS.map((s) => ({
    ...s,
    isRead: false,
    isMock: true,
    generatedAt: now,
    createdAt: now
  }));
  await Promise.all(seeded.map((i) => chipInsightsRepo.put(i)));
  return seeded;
}

export function ChipPage() {
  const [insights, setInsights] = useState<ChipInsight[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    seedInsightsIfEmpty()
      .then((all) => {
        if (cancelled) return;
        setInsights(all.filter((x) => !x.isRead));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissInsight(insight: ChipInsight) {
    chipInsightsRepo
      .put({ ...insight, isRead: true })
      .then(() => setInsights((prev) => prev.filter((i) => i.id !== insight.id)))
      .catch(() => {});
  }

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <i className="ti ti-sparkles text-white" style={{ fontSize: 16 }} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-primary">Chip</h1>
          <p className="text-xs text-secondary">Your AI money coach</p>
        </div>
      </div>

      {loaded && insights.length === 0 && (
        <div className="surface rounded-2xl p-6 text-center">
          <i className="ti ti-sparkles text-tertiary" style={{ fontSize: 36 }} aria-hidden="true" />
          <p className="text-sm font-medium text-primary mt-3">No new insights</p>
          <p className="text-xs text-secondary mt-1">Add your financial data and Chip will surface insights here.</p>
        </div>
      )}

      {insights.length > 0 && (
        <section>
          <p className="text-xs font-medium text-tertiary mb-2">Insights</p>
          <div className="flex flex-col gap-2">
            {insights.map((insight) => (
              <article key={insight.id} className="surface rounded-xl p-4">
                <span className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
                  {insight.moduleTag}
                </span>
                <p className="text-sm font-medium mt-0.5 mb-1 text-primary">{insight.headline}</p>
                <p className="text-xs leading-relaxed text-secondary">{insight.reasoning}</p>
                {insight.consequence && (
                  <p className="text-xs text-amber-600 mt-1.5 leading-relaxed">⚠ {insight.consequence}</p>
                )}
                {insight.actionLabel && (
                  <button
                    className="mt-2 text-xs font-medium"
                    style={{ color: 'var(--color-primary)' }}
                    onClick={() => dismissInsight(insight)}
                  >
                    {insight.actionLabel} →
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="surface rounded-2xl p-6 text-center">
        <i className="ti ti-message-chatbot text-tertiary" style={{ fontSize: 36 }} aria-hidden="true" />
        <p className="text-sm font-medium text-primary mt-3">Chip AI chat coming in Phase 2</p>
        <p className="text-xs text-secondary mt-1">Full conversational advisor powered by Claude.</p>
      </div>
    </div>
  );
}
