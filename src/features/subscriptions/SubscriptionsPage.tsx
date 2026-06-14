import { useMemo, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { expensesRepo, subscriptionsRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import type { Subscription } from '@/core/db/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { detectSubscriptions, type DetectedSubscription } from '@/core/subscriptions/detector';

function displayName(cat: string): string {
  return cat.replace(/\b\w/g, (c) => c.toUpperCase());
}

function intervalLabel(days: number): string {
  if (days === 7) return 'weekly';
  if (days === 14) return 'fortnightly';
  if (days === 30) return 'monthly';
  if (days === 91) return 'quarterly';
  if (days === 365) return 'annual';
  return `every ${days}d`;
}

function toMonthly(amount: number, intervalDays: number): number {
  return (amount / intervalDays) * 30;
}

function subKey(s: { merchantCategory: string; intervalDays: number }): string {
  return `${s.merchantCategory}:${s.intervalDays}`;
}

export function SubscriptionsPage() {
  const { mode } = usePrivacy();
  const { items: expenses } = useRepository(expensesRepo);
  const { items: stored, save: saveSubscription } = useRepository(subscriptionsRepo);

  const [activeTab, setActiveTab] = useState<'detected' | 'active'>('detected');
  // Capture mount time once — used for detection and as subscription timestamps.
  // Lazy initializer is the only allowed way to call Date.now() inside a component.
  const [nowMs] = useState(() => Date.now());

  // ── Derived ─────────────────────────────────────────────────────────────────

  const detected = useMemo(() => {
    if (expenses.length === 0) return [];
    const candidates = detectSubscriptions(expenses, nowMs);
    const storedKeys = new Set(stored.map((s) => subKey(s)));
    return candidates.filter((c) => !storedKeys.has(subKey(c)));
  }, [expenses, stored, nowMs]);

  const active = useMemo(() => stored.filter((s) => s.confirmedByUser && s.status !== 'cancelled'), [stored]);

  const monthlyTotal = useMemo(
    () => active.reduce((sum, s) => sum + toMonthly(s.detectedAmount, s.intervalDays), 0),
    [active]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleConfirm(candidate: DetectedSubscription) {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      merchantCategory: candidate.merchantCategory,
      detectedAmount: candidate.detectedAmount,
      intervalDays: candidate.intervalDays,
      status: candidate.status,
      confirmedByUser: true,
      createdAt: nowMs,
      updatedAt: nowMs
    };
    if (candidate.trialEndsAt !== undefined) sub.trialEndsAt = candidate.trialEndsAt;
    if (candidate.lastChargedAt !== undefined) sub.lastChargedAt = candidate.lastChargedAt;
    saveSubscription(sub).catch(() => {});
  }

  function handleDismiss(candidate: DetectedSubscription) {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      merchantCategory: candidate.merchantCategory,
      detectedAmount: candidate.detectedAmount,
      intervalDays: candidate.intervalDays,
      status: 'cancelled',
      confirmedByUser: false,
      createdAt: nowMs,
      updatedAt: nowMs
    };
    if (candidate.lastChargedAt !== undefined) sub.lastChargedAt = candidate.lastChargedAt;
    saveSubscription(sub).catch(() => {});
  }

  function handleCancel(sub: Subscription) {
    saveSubscription({ ...sub, status: 'cancelled', updatedAt: nowMs }).catch(() => {});
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Subscriptions</h2>
        {active.length > 0 && (
          <p className="text-sm text-secondary mt-0.5">
            {mode === 'open' ? formatCurrency(monthlyTotal) : '••••'}/month total
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-theme px-4">
        {(
          [
            ['detected', `Detected (${detected.length})`],
            ['active', `Active (${active.length})`]
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              activeTab === tab
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* ── Detected tab ── */}
        {activeTab === 'detected' && (
          <div className="px-4 py-4 flex flex-col gap-3">
            {detected.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-refresh text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm font-medium text-secondary mt-3">No new subscriptions detected</p>
                <p className="text-xs text-tertiary mt-1">
                  {expenses.length === 0
                    ? 'Add expenses first — recurring patterns will surface here.'
                    : 'All detected subscriptions have been reviewed.'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-tertiary">
                  Found {detected.length} recurring pattern{detected.length !== 1 ? 's' : ''} in your expenses. Confirm
                  ones you recognise.
                </p>
                {detected.map((c) => (
                  <div key={subKey(c)} className="surface rounded-2xl p-4 flex flex-col gap-3">
                    {/* Name + flags row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary truncate">{displayName(c.merchantCategory)}</p>
                        <p className="text-xs text-secondary mt-0.5">
                          {mode === 'open' ? formatCurrency(c.detectedAmount) : '••••'} ·{' '}
                          {intervalLabel(c.intervalDays)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {c.status === 'trial' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            Trial
                          </span>
                        )}
                        {c.priceCreep && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            Price creep
                          </span>
                        )}
                        {c.dormant && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-secondary">
                            Dormant
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta row */}
                    <p className="text-xs text-tertiary">
                      Seen {c.occurrenceCount} time{c.occurrenceCount !== 1 ? 's' : ''}
                      {c.lastChargedAt !== undefined && ` · last ${formatDateShort(c.lastChargedAt)}`}
                      {c.status === 'trial' && c.trialEndsAt !== undefined && (
                        <span className="ml-1 text-blue-500">· trial may end {formatDateShort(c.trialEndsAt)}</span>
                      )}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm(c)}
                        className="flex-1 py-2 rounded-xl text-white text-xs font-semibold"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        <i className="ti ti-check mr-1" aria-hidden="true" />
                        Confirm
                      </button>
                      <button
                        onClick={() => handleDismiss(c)}
                        className="flex-1 py-2 rounded-xl border border-theme text-secondary text-xs font-semibold"
                      >
                        <i className="ti ti-x mr-1" aria-hidden="true" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Active tab ── */}
        {activeTab === 'active' && (
          <div className="px-4 py-4 flex flex-col gap-3">
            {active.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-checklist text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm font-medium text-secondary mt-3">No active subscriptions</p>
                <p className="text-xs text-tertiary mt-1">
                  Confirm detected subscriptions to track your recurring costs here.
                </p>
              </div>
            ) : (
              <>
                {/* Monthly summary */}
                <div className="bg-surface-2 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-secondary">Monthly spend</span>
                  <span className="text-sm font-semibold text-primary">
                    {mode === 'open' ? formatCurrency(monthlyTotal) : '••••'}
                  </span>
                </div>

                {active.map((sub) => {
                  const monthly = toMonthly(sub.detectedAmount, sub.intervalDays);
                  return (
                    <div key={sub.id} className="surface rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-primary truncate">
                              {displayName(sub.merchantCategory)}
                            </p>
                            {sub.status === 'trial' && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                                Trial
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-secondary mt-0.5">
                            {mode === 'open' ? formatCurrency(sub.detectedAmount) : '••••'} ·{' '}
                            {intervalLabel(sub.intervalDays)}
                            {sub.intervalDays !== 30 && mode === 'open' && (
                              <span className="text-tertiary"> ({formatCurrency(monthly)}/mo)</span>
                            )}
                          </p>
                          {sub.lastChargedAt !== undefined && (
                            <p className="text-xs text-tertiary mt-0.5">
                              Last charged {formatDateShort(sub.lastChargedAt)}
                            </p>
                          )}
                          {sub.status === 'trial' && sub.trialEndsAt !== undefined && (
                            <p className="text-xs text-blue-500 mt-0.5">
                              Trial may end {formatDateShort(sub.trialEndsAt)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleCancel(sub)}
                          className="text-[10px] font-medium text-tertiary border border-theme rounded-lg px-2 py-1 flex-shrink-0 active:bg-surface-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
