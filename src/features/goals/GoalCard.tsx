import { useState } from 'react';
import { Card, TextInput, Button, ProgressRing } from '@/components/ui';
import { formatCurrency, formatDate, parseNumber } from '@/lib/formatters';
import { calcSipNeeded, monthsUntil } from '@/core/goals/sipCalculator';
import { getRiskColor, getRiskReturn } from '@/core/goals/meta';
import type { Goal } from './useGoals';

interface GoalCardProps {
  goal: Goal;
  mode: 'open' | 'safe' | 'privacy';
  onEdit: (goal: Goal) => void;
  onContribute: (goal: Goal, amount: number) => void;
}

export function GoalCard({ goal, mode, onEdit, onContribute }: GoalCardProps) {
  const [contributing, setContributing] = useState(false);
  const [amount, setAmount] = useState('');

  const pct = Math.min(goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0, 100);
  const color = getRiskColor(goal.risk);
  const months = monthsUntil(goal.targetDate);
  const sipNeeded = calcSipNeeded(goal.targetAmount, goal.currentAmount, months, getRiskReturn(goal.risk));

  function submit() {
    const n = parseNumber(amount);
    if (n <= 0) return;
    onContribute(goal, n);
    setContributing(false);
    setAmount('');
  }

  return (
    <Card>
      <div className="flex items-start gap-4">
        <ProgressRing percentage={pct} color={color} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold truncate text-primary">{goal.name}</p>
            <Button
              variant="ghost"
              icon="ti-pencil"
              aria-label={`Edit ${goal.name}`}
              className="ml-2 w-7 h-7 rounded-lg flex-shrink-0"
              onClick={() => onEdit(goal)}
            />
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
      {contributing ? (
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <TextInput
              type="number"
              inputMode="decimal"
              placeholder="Amount (₹)"
              value={amount}
              onChange={setAmount}
              autoFocus
            />
          </div>
          <Button size="sm" onClick={submit}>
            Add
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setContributing(false);
              setAmount('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="secondary" fullWidth icon="ti-plus" onClick={() => setContributing(true)} className="mt-3">
          Add contribution
        </Button>
      )}
    </Card>
  );
}
