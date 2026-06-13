import { useState, useMemo } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { insurancePoliciesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import type { InsurancePolicy, InsuranceType } from '@/core/db/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { PolicyForm } from './PolicyForm';

const POLICY_META: Record<InsuranceType, { label: string; icon: string; color: string }> = {
  term: { label: 'Term', icon: 'ti-umbrella', color: '#ef4444' },
  health: { label: 'Health', icon: 'ti-heart-rate-monitor', color: '#10b981' },
  vehicle: { label: 'Vehicle', icon: 'ti-car', color: '#f59e0b' },
  home: { label: 'Home', icon: 'ti-home', color: '#6366f1' },
  travel: { label: 'Travel', icon: 'ti-plane', color: '#0ea5e9' },
  life: { label: 'Life / ULIP', icon: 'ti-heart', color: '#8b5cf6' },
  other: { label: 'Other', icon: 'ti-shield', color: '#6b7280' }
};

function daysUntil(epochMs: number): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return Math.ceil((epochMs - todayStart.getTime()) / 86_400_000);
}

export function InsurancePage() {
  const { mode } = usePrivacy();
  const { items: policies, save: savePolicy, remove: removePolicy } = useRepository(insurancePoliciesRepo);

  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalAnnualPremium = useMemo(() => policies.reduce((s, p) => s + p.annualPremium, 0), [policies]);

  const expiringCount = useMemo(
    () => policies.filter((p) => daysUntil(p.renewalDate) <= 30 && daysUntil(p.renewalDate) > 0).length,
    [policies]
  );

  const sorted = useMemo(() => [...policies].sort((a, b) => a.renewalDate - b.renewalDate), [policies]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingPolicy(null);
    setShowForm(true);
  }

  function openEdit(p: InsurancePolicy) {
    setEditingPolicy(p);
    setShowForm(true);
  }

  async function handleSave(policy: InsurancePolicy) {
    await savePolicy(policy);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await removePolicy(id);
    setShowForm(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <h2 className="text-xl font-semibold text-slate-900">Insurance</h2>
        {policies.length > 0 && (
          <p className="text-sm text-slate-500 mt-0.5">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'} ·{' '}
            {mode === 'open' ? formatCurrency(totalAnnualPremium) : '••••'}/yr
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {policies.length === 0 ? (
          <div className="p-10 text-center">
            <i className="ti ti-shield text-slate-300" style={{ fontSize: 44 }} aria-hidden="true" />
            <p className="text-sm text-slate-400 mt-3">No policies yet. Tap + to add your first policy.</p>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-3">
            {/* Renewal alert banner */}
            {expiringCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <i
                  className="ti ti-alert-triangle text-amber-500 flex-shrink-0 mt-0.5"
                  style={{ fontSize: 16 }}
                  aria-hidden="true"
                />
                <p className="text-xs text-amber-700">
                  {expiringCount} {expiringCount === 1 ? 'policy renews' : 'policies renew'} within 30 days. Review and
                  renew to avoid a coverage gap.
                </p>
              </div>
            )}

            {sorted.map((policy) => {
              const meta = POLICY_META[policy.type];
              const days = daysUntil(policy.renewalDate);
              let badgeLabel: string;
              let badgeColor: string;
              let badgeBg: string;

              if (days <= 0) {
                badgeLabel = 'Expired';
                badgeColor = '#6b7280';
                badgeBg = '#f1f5f9';
              } else if (days <= 7) {
                badgeLabel = `${days}d left`;
                badgeColor = '#ef4444';
                badgeBg = '#fef2f2';
              } else if (days <= 30) {
                badgeLabel = `${days}d left`;
                badgeColor = '#f59e0b';
                badgeBg = '#fffbeb';
              } else {
                badgeLabel = formatDate(policy.renewalDate);
                badgeColor = '#64748b';
                badgeBg = '#f8fafc';
              }

              return (
                <button
                  key={policy.id}
                  onClick={() => openEdit(policy)}
                  className="bg-white rounded-2xl border border-slate-100 p-4 text-left w-full active:bg-slate-50"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}15` }}
                    >
                      <i className={`ti ${meta.icon}`} style={{ fontSize: 20, color: meta.color }} aria-hidden="true" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{policy.insurer}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: meta.color }}
                            >
                              {meta.label}
                            </span>
                            {policy.policyNumber && (
                              <span className="text-[10px] text-slate-400">{policy.policyNumber}</span>
                            )}
                          </div>
                        </div>
                        {/* Renewal badge */}
                        <span
                          className="text-[10px] font-medium px-2 py-1 rounded-lg flex-shrink-0"
                          style={{ color: badgeColor, backgroundColor: badgeBg }}
                        >
                          {badgeLabel}
                        </span>
                      </div>

                      {/* Coverage + premium */}
                      <div className="flex items-center gap-3 mt-2">
                        <div>
                          <p className="text-[10px] text-slate-400">Coverage</p>
                          <p className="text-xs font-semibold text-slate-800">
                            {mode === 'open' ? formatCurrency(policy.coverageAmount) : '••••'}
                          </p>
                        </div>
                        <div className="w-px h-6 bg-slate-100" />
                        <div>
                          <p className="text-[10px] text-slate-400">Premium / yr</p>
                          <p className="text-xs font-semibold text-slate-800">
                            {mode === 'open' ? formatCurrency(policy.annualPremium) : '••••'}
                          </p>
                        </div>
                        {policy.nominees && (
                          <>
                            <div className="w-px h-6 bg-slate-100" />
                            <div className="min-w-0">
                              <p className="text-[10px] text-slate-400">Nominee</p>
                              <p className="text-xs text-slate-600 truncate">{policy.nominees}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Summary footer */}
            <div className="bg-slate-50 rounded-xl p-3 mt-1">
              <p className="text-xs font-medium text-slate-500 mb-2">Coverage summary</p>
              <div className="flex flex-col gap-1.5">
                {(['term', 'life', 'health'] as InsuranceType[]).map((t) => {
                  const total = policies.filter((p) => p.type === t).reduce((s, p) => s + p.coverageAmount, 0);
                  if (total === 0) return null;
                  const m = POLICY_META[t];
                  return (
                    <div key={t} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <i className={`ti ${m.icon}`} style={{ fontSize: 12, color: m.color }} aria-hidden="true" />
                        <span className="text-xs text-slate-500">{m.label} cover</span>
                      </div>
                      <span className="text-xs font-medium text-slate-700">
                        {mode === 'open' ? formatCurrency(total) : '••••'}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 mt-0.5">
                  <span className="text-xs text-slate-500">Total annual premium</span>
                  <span className="text-xs font-semibold text-slate-800">
                    {mode === 'open' ? formatCurrency(totalAnnualPremium) : '••••'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={openAdd}
        className="fixed w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
        style={{
          bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          right: '1rem',
          backgroundColor: 'var(--color-primary)'
        }}
        aria-label="Add policy"
      >
        <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
      </button>

      {showForm && (
        <PolicyForm
          editing={editingPolicy}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
