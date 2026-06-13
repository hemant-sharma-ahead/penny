import { useState } from 'react';
import type { AssetClass, Holding } from '@/core/db/types';

interface Props {
  editing: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ASSET_CLASSES: { value: AssetClass; label: string; icon: string; color: string }[] = [
  { value: 'mf', label: 'Mutual Fund', icon: 'ti-chart-donut', color: '#6366f1' },
  { value: 'stock', label: 'Stock', icon: 'ti-trending-up', color: '#0ea5e9' },
  { value: 'fd', label: 'FD / RD', icon: 'ti-building-bank', color: '#f59e0b' },
  { value: 'nps', label: 'NPS', icon: 'ti-building-community', color: '#10b981' },
  { value: 'ppf', label: 'PPF / EPF', icon: 'ti-safe', color: '#8b5cf6' },
  { value: 'gold', label: 'Gold', icon: 'ti-coin', color: '#d97706' },
  { value: 'other', label: 'Other', icon: 'ti-dots', color: '#6b7280' }
];

export function HoldingForm({ editing, onSave, onDelete, onClose }: Props) {
  const [assetClass, setAssetClass] = useState<AssetClass>(editing?.assetClass ?? 'mf');
  const [name, setName] = useState(editing?.name ?? '');
  const [investedAmount, setInvestedAmount] = useState(editing ? String(editing.investedAmount) : '');
  const [currentValue, setCurrentValue] = useState(editing?.currentValue != null ? String(editing.currentValue) : '');
  const [schemeCode, setSchemeCode] = useState(editing?.schemeCode ?? '');
  const [symbol, setSymbol] = useState(editing?.symbol ?? '');
  const [units, setUnits] = useState(editing?.units != null ? String(editing.units) : '');
  const [avgCostPrice, setAvgCostPrice] = useState(editing?.avgCostPrice != null ? String(editing.avgCostPrice) : '');
  const [interestRate, setInterestRate] = useState(editing?.interestRate != null ? String(editing.interestRate) : '');
  const [maturityDate, setMaturityDate] = useState(() =>
    editing?.maturityDate != null ? epochToDateInput(editing.maturityDate) : ''
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const invested = parseFloat(investedAmount);
    if (!name.trim() || isNaN(invested) || invested <= 0) return;
    setSaving(true);
    const now = Date.now();
    const parsedUnits = parseFloat(units) || undefined;
    const parsedAvgCost = parseFloat(avgCostPrice) || undefined;
    const parsedCurrentValue = parseFloat(currentValue) || undefined;

    const holding: Holding = {
      id: editing?.id ?? crypto.randomUUID(),
      assetClass,
      name: name.trim(),
      investedAmount: invested,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    };

    if (parsedCurrentValue !== undefined) holding.currentValue = parsedCurrentValue;
    const notesVal = notes.trim();
    if (notesVal) holding.notes = notesVal;

    if (assetClass === 'mf') {
      const sc = schemeCode.trim();
      if (sc) holding.schemeCode = sc;
      if (parsedUnits !== undefined) holding.units = parsedUnits;
      if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
    } else if (assetClass === 'stock') {
      const sym = symbol.trim().toUpperCase();
      if (sym) holding.symbol = sym;
      if (parsedUnits !== undefined) holding.units = parsedUnits;
      if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
    } else if (assetClass === 'fd') {
      const rate = parseFloat(interestRate);
      if (!isNaN(rate) && rate > 0) holding.interestRate = rate;
      if (maturityDate) holding.maturityDate = new Date(maturityDate).getTime();
    } else if (assetClass === 'gold') {
      if (parsedUnits !== undefined) holding.units = parsedUnits;
      if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
    }

    onSave(holding)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{editing ? 'Edit holding' : 'Add holding'}</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Asset class */}
        <div>
          <label className="text-xs font-medium text-slate-500">Asset type</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {ASSET_CLASSES.map((ac) => (
              <button
                key={ac.value}
                type="button"
                onClick={() => setAssetClass(ac.value)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors"
                style={
                  assetClass === ac.value
                    ? { borderColor: ac.color, backgroundColor: `${ac.color}10` }
                    : { borderColor: '#f1f5f9' }
                }
              >
                <i
                  className={`ti ${ac.icon}`}
                  style={{ fontSize: 18, color: assetClass === ac.value ? ac.color : '#94a3b8' }}
                  aria-hidden="true"
                />
                <span
                  className="text-[9px] font-medium text-center leading-tight"
                  style={{ color: assetClass === ac.value ? ac.color : '#64748b' }}
                >
                  {ac.label.split(' ')[0] ?? ac.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-medium text-slate-500">Name</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder={
              assetClass === 'mf'
                ? 'e.g. Parag Parikh Flexi Cap'
                : assetClass === 'stock'
                  ? 'e.g. Reliance Industries'
                  : assetClass === 'fd'
                    ? 'e.g. SBI FD 7.1%'
                    : 'e.g. PPF Account'
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* MF-specific */}
        {assetClass === 'mf' && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500">
                MFAPI scheme code <span className="text-slate-400 font-normal">(e.g. 120503 for PPFAS)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                placeholder="Leave blank to enter price manually"
                value={schemeCode}
                onChange={(e) => setSchemeCode(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Units held</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="0.000"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Avg NAV (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="0.00"
                  value={avgCostPrice}
                  onChange={(e) => setAvgCostPrice(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {/* Stock-specific */}
        {assetClass === 'stock' && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500">
                NSE symbol <span className="text-slate-400 font-normal">(e.g. RELIANCE)</span>
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                placeholder="INFY, TCS, HDFC..."
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Shares held</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="0"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Avg buy price (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="0.00"
                  value={avgCostPrice}
                  onChange={(e) => setAvgCostPrice(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {/* FD-specific */}
        {assetClass === 'fd' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Interest rate (%)</label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                placeholder="7.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Maturity date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Gold-specific */}
        {assetClass === 'gold' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Weight (grams)</label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                placeholder="0.00"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Avg buy price (₹/g)</label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                placeholder="0.00"
                value={avgCostPrice}
                onChange={(e) => setAvgCostPrice(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Invested amount (always) */}
        <div>
          <label className="text-xs font-medium text-slate-500">Amount invested (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="0"
            value={investedAmount}
            onChange={(e) => setInvestedAmount(e.target.value)}
          />
        </div>

        {/* Current value (manual override) */}
        <div>
          <label className="text-xs font-medium text-slate-500">
            Current value (₹){' '}
            <span className="text-slate-400 font-normal">— optional, fetched automatically for MF/stocks</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="Leave blank to use invested amount"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-slate-500">Notes (optional)</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="e.g. held in Zerodha, SBI Kolar branch"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {editing && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Saving…' : editing ? 'Update' : 'Add holding'}
          </button>
        </div>
      </div>
    </div>
  );
}
