import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { calcSipNeeded, monthsUntil } from '@/core/goals/sipCalculator';
import { GoalForm } from './GoalForm';
import { useGoals } from './useGoals';
import type { Goal } from './useGoals';

const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const RISK_COLORS: Record<string, string> = {
  conservative: '#3b82f6',
  moderate: '#10b981',
  aggressive: '#ef4444'
};

const RISK_RETURNS: Record<string, number> = {
  conservative: 7,
  moderate: 11,
  aggressive: 14
};

const SIP_RETURN_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: 'Conservative' },
  { value: '11', label: 'Moderate' },
  { value: '14', label: 'Aggressive' }
];

export function GoalsPage() {
  const { mode } = usePrivacy();
  const { goals, saveGoal, removeGoal, totalSaved, totalTarget } = useGoals();

  // UI state — tabs, modals, contribution input, SIP calculator inputs
  const [activeTab, setActiveTab] = useState<'goals' | 'sip'>('goals');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [contributingTo, setContributingTo] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState('');

  const [sipTarget, setSipTarget] = useState('');
  const [sipSaved, setSipSaved] = useState('');
  const [sipYears, setSipYears] = useState('');
  const [sipReturn, setSipReturn] = useState('11');
  const [sipResult, setSipResult] = useState<number | null>(null);

  function openAdd() {
    setEditingGoal(null);
    setShowForm(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setShowForm(true);
  }

  async function handleSave(goal: Goal) {
    await saveGoal(goal);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await removeGoal(id);
    setShowForm(false);
  }

  function handleAddContribution(goal: Goal) {
    const amount = parseFloat(contribAmount);
    if (isNaN(amount) || amount <= 0) return;
    saveGoal({ ...goal, currentAmount: goal.currentAmount + amount, updatedAt: Date.now() })
      .then(() => {
        setContributingTo(null);
        setContribAmount('');
      })
      .catch(() => {});
  }

  function calcSipResult() {
    const target = parseFloat(sipTarget);
    const saved = parseFloat(sipSaved) || 0;
    const years = parseFloat(sipYears);
    const ret = parseFloat(sipReturn) || 11;
    if (isNaN(target) || isNaN(years) || target <= 0 || years <= 0) return;
    setSipResult(calcSipNeeded(target, saved, years * 12, ret));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Goals</h2>
        {goals.length > 0 && (
          <p className="text-sm mt-0.5 text-secondary">
            {mode === 'open' ? formatCurrency(totalSaved) : '••••'} of{' '}
            {mode === 'open' ? formatCurrency(totalTarget) : '••••'} saved
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex px-4 border-b border-theme">
        {(['goals', 'sip'] as const).map((tab) => (
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
            {tab === 'sip' ? 'SIP Calculator' : 'Goals'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Goals tab ── */}
        {activeTab === 'goals' && (
          <div>
            {goals.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-target text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">No goals yet. Tap + to set your first goal.</p>
              </div>
            ) : (
              <div className="px-4 py-4 flex flex-col gap-3">
                {goals.map((goal) => {
                  const pct = Math.min(goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0, 100);
                  const color = RISK_COLORS[goal.risk] ?? '#10b981';
                  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);
                  const months = monthsUntil(goal.targetDate);
                  const annualReturn = RISK_RETURNS[goal.risk] ?? 11;
                  const sipNeeded = calcSipNeeded(goal.targetAmount, goal.currentAmount, months, annualReturn);
                  const isContributing = contributingTo === goal.id;

                  return (
                    <div key={goal.id} className="surface rounded-2xl p-4">
                      <div className="flex items-start gap-4">
                        {/* Progress ring */}
                        <div className="flex-shrink-0">
                          <svg viewBox="0 0 100 100" width="72" height="72" aria-hidden="true">
                            <circle
                              cx="50"
                              cy="50"
                              r={RING_RADIUS}
                              fill="none"
                              strokeWidth="10"
                              style={{ stroke: 'var(--color-surface-tertiary)' }}
                            />
                            <circle
                              cx="50"
                              cy="50"
                              r={RING_RADIUS}
                              fill="none"
                              stroke={color}
                              strokeWidth="10"
                              strokeDasharray={String(RING_CIRCUMFERENCE)}
                              strokeDashoffset={String(dashOffset)}
                              strokeLinecap="round"
                              transform="rotate(-90 50 50)"
                            />
                            <text
                              x="50"
                              y="50"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="18"
                              fontWeight="700"
                              style={{ fill: 'var(--color-text-primary)' }}
                            >
                              {Math.round(pct)}%
                            </text>
                          </svg>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold truncate text-primary">{goal.name}</p>
                            <button
                              onClick={() => openEdit(goal)}
                              className="ml-2 flex-shrink-0 p-0.5 text-tertiary"
                              aria-label={`Edit ${goal.name}`}
                            >
                              <i className="ti ti-pencil" style={{ fontSize: 15 }} aria-hidden="true" />
                            </button>
                          </div>
                          <p className="text-xs mt-0.5 text-secondary">
                            {mode === 'open' ? formatCurrency(goal.currentAmount) : '••••'} of{' '}
                            {mode === 'open' ? formatCurrency(goal.targetAmount) : '••••'}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white capitalize"
                              style={{ backgroundColor: color }}
                            >
                              {goal.risk}
                            </span>
                            <span className="text-[10px] text-tertiary">
                              {months > 0 ? `${months}mo left` : 'Due'} · {formatDate(goal.targetDate)}
                            </span>
                          </div>
                          {sipNeeded > 0 && (
                            <p className="text-[10px] mt-1 text-tertiary">
                              SIP needed: {mode === 'open' ? formatCurrency(Math.ceil(sipNeeded)) : '••••'}
                              /mo
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Contribution row */}
                      {isContributing ? (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            className="input-surface flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                            placeholder="Amount (₹)"
                            value={contribAmount}
                            onChange={(e) => setContribAmount(e.target.value)}
                            autoFocus
                          />
                          <button
                            className="px-4 py-2 rounded-xl text-white text-sm font-medium"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                            onClick={() => handleAddContribution(goal)}
                          >
                            Add
                          </button>
                          <button
                            className="px-3 py-2 rounded-xl text-sm border border-theme text-secondary"
                            onClick={() => {
                              setContributingTo(null);
                              setContribAmount('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="mt-3 w-full py-2.5 rounded-xl border text-sm font-medium transition-colors"
                          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                          onClick={() => {
                            setContributingTo(goal.id);
                            setContribAmount('');
                          }}
                        >
                          + Add contribution
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SIP Calculator tab ── */}
        {activeTab === 'sip' && (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Info box — theme-safe tint */}
            <div className="rounded-xl p-3 flex gap-2 bg-surface-2 border border-theme">
              <i
                className="ti ti-calculator flex-shrink-0 mt-0.5"
                style={{ fontSize: 18, color: 'var(--color-primary)' }}
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-secondary">
                Enter your goal details to find the monthly SIP amount needed to reach your target, accounting for any
                savings already set aside.
              </p>
            </div>

            <div className="surface rounded-xl p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-secondary">Goal amount (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="e.g. 1000000"
                  value={sipTarget}
                  onChange={(e) => setSipTarget(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-secondary">Already saved (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="0"
                  value={sipSaved}
                  onChange={(e) => setSipSaved(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-secondary">Time horizon (years)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="e.g. 5"
                  value={sipYears}
                  onChange={(e) => setSipYears(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-secondary">Expected return (% per year)</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {SIP_RETURN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSipReturn(opt.value)}
                      className="py-2 rounded-xl text-xs font-medium border-2 transition-colors"
                      style={
                        sipReturn === opt.value
                          ? { borderColor: '#00a86b', color: '#00a86b', backgroundColor: '#00a86b10' }
                          : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {opt.value}% {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={calcSipResult}
                className="w-full py-3 rounded-xl text-white text-sm font-medium"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Calculate
              </button>
            </div>

            {sipResult !== null && (
              <div className="surface rounded-xl p-5 text-center">
                <p className="text-xs mb-1 text-secondary">Required monthly SIP</p>
                <p className="text-3xl font-semibold text-primary">{formatCurrency(Math.ceil(sipResult))}</p>
                <p className="text-xs mt-1 text-tertiary">
                  per month for {sipYears} year{sipYears === '1' ? '' : 's'} at {sipReturn}% p.a.
                </p>
                {parseFloat(sipSaved) > 0 && (
                  <p className="text-xs mt-2" style={{ color: 'var(--color-primary)' }}>
                    Existing savings of {formatCurrency(parseFloat(sipSaved))} factored in.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB — add goal */}
      {activeTab === 'goals' && (
        <button
          onClick={openAdd}
          className="fixed w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            right: '1rem',
            backgroundColor: 'var(--color-primary)'
          }}
          aria-label="Add goal"
        >
          <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
        </button>
      )}

      {showForm && (
        <GoalForm
          editing={editingGoal}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
