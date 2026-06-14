import { useMemo, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { personalIousRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import type { PersonalIou } from '@/core/db/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { IouForm } from './IouForm';

function dueLabel(dueDate: number, nowMs: number): { text: string; color: string; bg: string } {
  const days = Math.ceil((dueDate - nowMs) / 86_400_000);
  if (days < 0) return { text: `${-days}d overdue`, color: '#ef4444', bg: '#fef2f2' };
  if (days === 0) return { text: 'Due today', color: '#f59e0b', bg: '#fffbeb' };
  if (days <= 7) return { text: `${days}d left`, color: '#f59e0b', bg: '#fffbeb' };
  return { text: formatDateShort(dueDate), color: '#64748b', bg: '#f8fafc' };
}

export function IouPage() {
  const { mode } = usePrivacy();
  const { items: ious, save: saveIou, remove: removeIou } = useRepository(personalIousRepo);

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [showForm, setShowForm] = useState(false);
  const [editingIou, setEditingIou] = useState<PersonalIou | null>(null);
  const [nowMs] = useState(() => Date.now());

  // ── Derived ─────────────────────────────────────────────────────────────────

  const active = useMemo(() => ious.filter((i) => !i.isSettled), [ious]);
  const history = useMemo(
    () =>
      [...ious.filter((i) => i.isSettled)].sort((a, b) => (b.settledAt ?? b.updatedAt) - (a.settledAt ?? a.updatedAt)),
    [ious]
  );

  const sortedActive = useMemo(() => {
    return [...active].sort((a, b) => {
      const aRemaining = a.dueDate !== undefined ? Math.ceil((a.dueDate - nowMs) / 86_400_000) : null;
      const bRemaining = b.dueDate !== undefined ? Math.ceil((b.dueDate - nowMs) / 86_400_000) : null;
      if (aRemaining !== null && aRemaining < 0 && bRemaining !== null && bRemaining < 0)
        return aRemaining - bRemaining;
      if (aRemaining !== null && aRemaining < 0) return -1;
      if (bRemaining !== null && bRemaining < 0) return 1;
      if (aRemaining !== null && bRemaining !== null) return aRemaining - bRemaining;
      if (aRemaining !== null) return -1;
      if (bRemaining !== null) return 1;
      return b.date - a.date;
    });
  }, [active, nowMs]);

  const totalLent = useMemo(
    () => active.filter((i) => i.direction === 'lent').reduce((s, i) => s + i.amount, 0),
    [active]
  );
  const totalBorrowed = useMemo(
    () => active.filter((i) => i.direction === 'borrowed').reduce((s, i) => s + i.amount, 0),
    [active]
  );
  const overdueCount = useMemo(
    () => active.filter((i) => i.dueDate !== undefined && i.dueDate < nowMs).length,
    [active, nowMs]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingIou(null);
    setShowForm(true);
  }

  function openEdit(iou: PersonalIou) {
    setEditingIou(iou);
    setShowForm(true);
  }

  async function handleSave(iou: PersonalIou) {
    await saveIou(iou);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await removeIou(id);
    setShowForm(false);
  }

  function handleSettle(iou: PersonalIou) {
    saveIou({ ...iou, isSettled: true, settledAt: nowMs, updatedAt: nowMs }).catch(() => {});
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          IOUs
        </h2>
        {active.length > 0 && (
          <div className="flex gap-3 mt-1">
            {totalLent > 0 && (
              <span className="text-xs font-medium text-emerald-600">
                You&apos;re owed {mode === 'open' ? formatCurrency(totalLent) : '••••'}
              </span>
            )}
            {totalLent > 0 && totalBorrowed > 0 && (
              <span className="text-xs" style={{ color: 'var(--color-border-strong)' }}>
                ·
              </span>
            )}
            {totalBorrowed > 0 && (
              <span className="text-xs font-medium text-red-500">
                You owe {mode === 'open' ? formatCurrency(totalBorrowed) : '••••'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex px-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {(
          [
            ['active', `Active (${active.length})`],
            ['history', `History (${history.length})`]
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

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Active tab ── */}
        {activeTab === 'active' && (
          <div className="px-4 py-4 flex flex-col gap-3">
            {/* Overdue alert */}
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
                <i
                  className="ti ti-arrows-exchange"
                  style={{ fontSize: 44, color: 'var(--color-text-tertiary)' }}
                  aria-hidden="true"
                />
                <p className="text-sm mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  No active IOUs. Tap + to log one.
                </p>
              </div>
            ) : (
              sortedActive.map((iou) => {
                const isLent = iou.direction === 'lent';
                const accentColor = isLent ? '#10b981' : '#ef4444';
                const accentBg = isLent ? '#f0fdf4' : '#fef2f2';
                const due = iou.dueDate !== undefined ? dueLabel(iou.dueDate, nowMs) : null;

                return (
                  <button
                    key={iou.id}
                    onClick={() => openEdit(iou)}
                    className="rounded-2xl p-4 text-left w-full"
                    style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Direction icon */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: accentBg }}
                      >
                        <i
                          className={`ti ${isLent ? 'ti-arrow-up' : 'ti-arrow-down'}`}
                          style={{ fontSize: 18, color: accentColor }}
                          aria-hidden="true"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {iou.description}
                          </p>
                          <p className="text-sm font-semibold flex-shrink-0" style={{ color: accentColor }}>
                            {mode === 'open' ? formatCurrency(iou.amount) : '••••'}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-1 gap-2">
                          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {isLent ? 'Lent' : 'Borrowed'} {formatDateShort(iou.date)}
                          </p>
                          {due !== null && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0"
                              style={{ color: due.color, backgroundColor: due.bg }}
                            >
                              {due.text}
                            </span>
                          )}
                        </div>
                        {iou.notes && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                            {iou.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Settle row */}
                    <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSettle(iou);
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                      >
                        <i className="ti ti-check mr-1" aria-hidden="true" />
                        Mark settled
                      </button>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── History tab ── */}
        {activeTab === 'history' && (
          <div className="px-4 py-4 flex flex-col gap-3">
            {history.length === 0 ? (
              <div className="p-10 text-center">
                <i
                  className="ti ti-clock-check"
                  style={{ fontSize: 44, color: 'var(--color-text-tertiary)' }}
                  aria-hidden="true"
                />
                <p className="text-sm mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  No settled IOUs yet.
                </p>
              </div>
            ) : (
              history.map((iou) => {
                const isLent = iou.direction === 'lent';
                const accentColor = isLent ? '#10b981' : '#ef4444';
                return (
                  <button
                    key={iou.id}
                    onClick={() => openEdit(iou)}
                    className="rounded-2xl p-4 text-left w-full opacity-70"
                    style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                      >
                        <i
                          className="ti ti-check"
                          style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>
                            {iou.description}
                          </p>
                          <p className="text-sm font-semibold flex-shrink-0" style={{ color: accentColor }}>
                            {mode === 'open' ? formatCurrency(iou.amount) : '••••'}
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                          {isLent ? 'Lent' : 'Borrowed'} {formatDateShort(iou.date)}
                          {iou.settledAt !== undefined && ` · settled ${formatDateShort(iou.settledAt)}`}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
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
        aria-label="Add IOU"
      >
        <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
      </button>

      {showForm && (
        <IouForm
          editing={editingIou}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowForm(false)}
          nowMs={nowMs}
        />
      )}
    </div>
  );
}
