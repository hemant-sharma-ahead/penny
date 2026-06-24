import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings, type FontScale, type ModuleVisibility, type Theme } from '@/context/SettingsContext';
import { type PrivacyMode } from '@/context/PrivacyContext';
import { clearDemoData, isDemoSeeded } from '@/core/db/seedDemoData';
import { PATHS } from '@/router/paths';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ModuleRow {
  key: keyof ModuleVisibility;
  label: string;
  icon: string;
  color: string;
}

const MODULE_ROWS: ModuleRow[] = [
  { key: 'portfolio', label: 'Portfolio', icon: 'ti-chart-pie', color: '#6366f1' },
  { key: 'goals', label: 'Goals', icon: 'ti-target', color: '#10b981' },
  { key: 'insurance', label: 'Insurance', icon: 'ti-shield', color: '#3b82f6' },
  { key: 'loans', label: 'Loans', icon: 'ti-calculator', color: '#06b6d4' },
  { key: 'health', label: 'Health', icon: 'ti-heart-rate-monitor', color: '#ec4899' },
  { key: 'tax', label: 'Tax', icon: 'ti-receipt-tax', color: '#8b5cf6' },
  { key: 'cashflow', label: 'Cash Flow', icon: 'ti-trending-down', color: '#14b8a6' }
];

const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'default', label: 'A' },
  { value: 'large', label: 'A+' },
  { value: 'xl', label: 'A++' }
];

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'ti-sun' },
  { value: 'system', label: 'System', icon: 'ti-device-desktop' },
  { value: 'dark', label: 'Dark', icon: 'ti-moon' }
];

export function SettingsDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { modules, fontScale, theme, defaultPrivacyMode, setModule, setFontScale, setTheme, setDefaultPrivacyMode } =
    useSettings();
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearSample = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    await clearDemoData();
  };

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-60 bg-black/30" onClick={onClose} aria-hidden="true" />}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 z-70 flex flex-col shadow-2xl transition-transform duration-300 bg-surface text-primary ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-theme">
          <span className="text-base font-semibold text-primary">Settings</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 text-secondary"
            aria-label="Close settings"
          >
            <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Modules section */}
          <section className="px-4 pt-4 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 text-tertiary">Modules</p>
            <p className="text-[10px] mb-3 text-tertiary">Tap to show/hide. Home, Expenses &amp; Chip are always on.</p>
            <div className="grid grid-cols-5 gap-1.5">
              {MODULE_ROWS.map((row) => {
                const on = modules[row.key];
                return (
                  <button
                    key={row.key}
                    onClick={() => setModule(row.key, !on)}
                    aria-pressed={on}
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-colors"
                    style={
                      on
                        ? { backgroundColor: `${row.color}1a`, borderColor: row.color, color: row.color }
                        : {
                            backgroundColor: 'var(--color-surface-secondary)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-tertiary)'
                          }
                    }
                  >
                    <i className={`ti ${row.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
                    <span className="text-[9px] font-medium leading-tight text-center px-0.5">{row.label}</span>
                  </button>
                );
              })}
              {/* Calculators — navigates to the calculators page */}
              <button
                onClick={() => {
                  onClose();
                  navigate(PATHS.app.calculators);
                }}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-colors"
                style={{ backgroundColor: '#f97316' + '1a', borderColor: '#f97316', color: '#f97316' }}
              >
                <i className="ti ti-math-function" style={{ fontSize: 18 }} aria-hidden="true" />
                <span className="text-[9px] font-medium leading-tight text-center px-0.5">Calc</span>
              </button>
            </div>
          </section>

          <div className="mx-4 my-2 border-t border-theme" />

          {/* Display section */}
          <section className="px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-tertiary">Display</p>

            <p className="text-xs mb-2 text-secondary">Theme</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors"
                  style={
                    theme === t.value
                      ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                      : {
                          backgroundColor: 'transparent',
                          color: 'var(--color-text-secondary)',
                          borderColor: 'var(--color-border)'
                        }
                  }
                >
                  <i className={`ti ${t.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>

            <p className="text-xs mb-2 text-secondary">Font size</p>
            <div className="grid grid-cols-4 gap-2">
              {FONT_SCALES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFontScale(s.value)}
                  className="py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={
                    fontScale === s.value
                      ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                      : {
                          backgroundColor: 'transparent',
                          color: 'var(--color-text-secondary)',
                          borderColor: 'var(--color-border)'
                        }
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <div className="mx-4 my-2 border-t border-theme" />

          {/* Privacy section */}
          <section className="px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-tertiary">Privacy</p>
            <p className="text-xs text-secondary mb-2">Default mode on app open</p>
            <div className="flex gap-2">
              {(
                [
                  { mode: 'safe', label: 'Safe', color: '#f59e0b' },
                  { mode: 'privacy', label: 'Private', color: '#7c3aed' },
                  { mode: 'open', label: 'Open', color: '#dc2626' }
                ] as { mode: PrivacyMode; label: string; color: string }[]
              ).map(({ mode: m, label, color }) => (
                <button
                  key={m}
                  onClick={() => setDefaultPrivacyMode(m)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                  style={
                    defaultPrivacyMode === m
                      ? { backgroundColor: color, color: '#fff', borderColor: color }
                      : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div className="mx-4 my-2 border-t border-theme" />

          {/* Security section */}
          <section className="px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-tertiary">Security &amp; Data</p>
            {[
              { icon: 'ti-lock', label: 'Change PIN', path: null },
              { icon: 'ti-key', label: 'Change Passphrase', path: null },
              { icon: 'ti-database-export', label: 'Backup & Restore', path: PATHS.app.backup }
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  if (item.path) {
                    onClose();
                    navigate(item.path);
                  }
                }}
                className="flex items-center justify-between w-full py-2.5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-2">
                    <i className={`ti ${item.icon} text-secondary`} style={{ fontSize: 15 }} aria-hidden="true" />
                  </div>
                  <span className="text-sm text-primary">{item.label}</span>
                </div>
                <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 16 }} aria-hidden="true" />
              </button>
            ))}
          </section>

          {isDemoSeeded() && (
            <>
              <div className="mx-4 my-2 border-t border-theme" />

              <section className="px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-tertiary">Sample Data</p>
                <p className="text-xs mb-3 leading-relaxed text-secondary">
                  Remove all sample records and start fresh with your own data.
                </p>
                <button
                  onClick={() => void handleClearSample()}
                  disabled={clearing}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40"
                  style={
                    confirmClear
                      ? { backgroundColor: '#ef4444', color: '#fff', borderColor: '#ef4444' }
                      : { backgroundColor: 'transparent', color: '#ef4444', borderColor: '#ef4444' }
                  }
                >
                  {clearing ? 'Clearing…' : confirmClear ? 'Tap again to confirm' : 'Clear sample data'}
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
