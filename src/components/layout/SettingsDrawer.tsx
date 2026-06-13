import { useSettings, type FontScale, type ModuleVisibility } from '@/context/SettingsContext';

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

export function SettingsDrawer({ open, onClose }: Props) {
  const { modules, fontScale, setModule, setFontScale } = useSettings();

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-60 bg-black/30" onClick={onClose} aria-hidden="true" />}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-white z-70 flex flex-col shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <span className="text-base font-semibold text-slate-900">Settings</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close settings"
          >
            <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Modules section */}
          <section className="px-4 pt-4 pb-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Modules</p>
            <p className="text-xs text-slate-400 mb-3">Home, Expenses, and Chip are always visible.</p>
            <div className="flex flex-col gap-1">
              {MODULE_ROWS.map((row) => (
                <label key={row.key} className="flex items-center justify-between py-2.5 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                      <i className={`ti ${row.icon} text-slate-500`} style={{ fontSize: 15 }} aria-hidden="true" />
                    </div>
                    <span className="text-sm text-slate-800">{row.label}</span>
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

          <div className="h-px bg-slate-100 mx-4 my-2" />

          {/* Display section */}
          <section className="px-4 py-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Display</p>
            <p className="text-xs text-slate-500 mb-3">Font size</p>
            <div className="grid grid-cols-4 gap-2">
              {FONT_SCALES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFontScale(s.value)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    fontScale === s.value
                      ? 'bg-[#00a86b] text-white border-[#00a86b]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <div className="h-px bg-slate-100 mx-4 my-2" />

          {/* Security section */}
          <section className="px-4 py-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Security</p>
            <button className="flex items-center justify-between w-full py-2.5 text-left">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <i className="ti ti-lock text-slate-500" style={{ fontSize: 15 }} aria-hidden="true" />
                </div>
                <span className="text-sm text-slate-800">Change PIN</span>
              </div>
              <i className="ti ti-chevron-right text-slate-300" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
