import { useSettings, type FontScale, type ModuleVisibility, type Theme } from '@/context/SettingsContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ModuleRow {
  key: keyof ModuleVisibility;
  label: string;
  icon: string;
}

const MODULE_ROWS: ModuleRow[] = [
  { key: 'portfolio', label: 'Portfolio', icon: 'ti-chart-pie' },
  { key: 'goals', label: 'Goals', icon: 'ti-target' },
  { key: 'insurance', label: 'Insurance', icon: 'ti-shield' },
  { key: 'subscriptions', label: 'Subscriptions', icon: 'ti-refresh' },
  { key: 'iou', label: 'IOUs', icon: 'ti-arrows-exchange' },
  { key: 'loans', label: 'Loans', icon: 'ti-calculator' },
  { key: 'health', label: 'Health Score', icon: 'ti-heart-rate-monitor' },
  { key: 'tax', label: 'Tax', icon: 'ti-receipt-tax' },
  { key: 'cashflow', label: 'Cash Flow', icon: 'ti-trending-down' },
  { key: 'backup', label: 'Backup', icon: 'ti-cloud-download' }
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
  const { modules, fontScale, theme, setModule, setFontScale, setTheme } = useSettings();

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-60 bg-black/30" onClick={onClose} aria-hidden="true" />}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 z-70 flex flex-col shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <span className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Settings
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Close settings"
          >
            <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Modules section */}
          <section className="px-4 pt-4 pb-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Modules
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              Home, Expenses, and Chip are always visible.
            </p>
            <div className="flex flex-col gap-1">
              {MODULE_ROWS.map((row) => (
                <label key={row.key} className="flex items-center justify-between py-2.5 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                    >
                      <i
                        className={`ti ${row.icon}`}
                        style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {row.label}
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={modules[row.key]}
                    onClick={() => setModule(row.key, !modules[row.key])}
                    className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#00a86b] ${
                      modules[row.key] ? 'bg-[#00a86b]' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        modules[row.key] ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
          </section>

          <div className="h-px mx-4 my-2" style={{ backgroundColor: 'var(--color-border)' }} />

          {/* Display section */}
          <section className="px-4 py-4">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Display
            </p>

            <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Theme
            </p>
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

            <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Font size
            </p>
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

          <div className="h-px mx-4 my-2" style={{ backgroundColor: 'var(--color-border)' }} />

          {/* Security section */}
          <section className="px-4 py-4">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Security
            </p>
            <button className="flex items-center justify-between w-full py-2.5 text-left">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                >
                  <i
                    className="ti ti-lock"
                    style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}
                    aria-hidden="true"
                  />
                </div>
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  Change PIN
                </span>
              </div>
              <i
                className="ti ti-chevron-right"
                style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }}
                aria-hidden="true"
              />
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
