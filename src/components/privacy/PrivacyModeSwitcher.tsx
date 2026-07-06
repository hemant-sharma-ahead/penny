import { useState, useRef, useEffect } from 'react';
import { usePrivacy, type PrivacyMode } from '@/context/PrivacyContext';
import { verifyPin } from '@/core/crypto/securityManager';

const MODE: Record<PrivacyMode, { label: string; icon: string; color: string }> = {
  safe: { label: 'Safe', icon: 'ti-eye-off', color: 'var(--color-safe)' },
  privacy: { label: 'Private', icon: 'ti-shield-lock', color: 'var(--color-privacy)' },
  open: { label: 'Open', icon: 'ti-eye', color: 'var(--color-open)' }
};
const MODE_ORDER: PrivacyMode[] = ['safe', 'privacy', 'open'];

type Step = null | 'pin' | 'warning';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function PrivacyModeSwitcher() {
  const { mode, setMode, openModeExpiresAt } = usePrivacy();
  const [step, setStep] = useState<Step>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [tickNow, setTickNow] = useState(() => Date.now());

  // Live countdown while an Open-mode window is active — ticks every second so the badge stays accurate.
  useEffect(() => {
    if (!openModeExpiresAt) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openModeExpiresAt]);
  const openCountdown = openModeExpiresAt ? formatCountdown(openModeExpiresAt - tickNow) : null;

  useEffect(() => {
    if (step === 'pin') {
      const t = setTimeout(() => pinInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Dismiss the mode menu on Escape (outside-click handled by the backdrop).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const active = MODE[mode];

  const handleSelect = (target: PrivacyMode) => {
    setMenuOpen(false);
    if (target === mode) return;
    if (target === 'open') {
      setPinInput('');
      setPinError('');
      setStep('pin');
    } else {
      setMode(target);
    }
  };

  const handlePinConfirm = async () => {
    if (pinInput.length !== 6) return;
    setVerifying(true);
    setPinError('');
    const res = await verifyPin(pinInput);
    setVerifying(false);
    if (res.status === 'ok') {
      setPinInput('');
      setStep('warning');
    } else if (res.status === 'wiped') {
      window.location.reload(); // data erased — app resets to onboarding
    } else if (res.status === 'locked_out') {
      setPinError('Too many attempts — try again later.');
      setPinInput('');
    } else {
      setPinError(
        res.attemptsRemaining > 0
          ? `Incorrect PIN — ${res.attemptsRemaining} attempt${res.attemptsRemaining === 1 ? '' : 's'} left`
          : 'Incorrect PIN'
      );
      setPinInput('');
      pinInputRef.current?.focus();
    }
  };

  const handleConfirmOpen = () => {
    setMode('open');
    setStep(null);
  };

  const handleClose = () => {
    setStep(null);
    setPinInput('');
    setPinError('');
  };

  return (
    <>
      {/* Mode-tinted icon button + dropdown */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="w-8 h-8 rounded-full grid place-items-center transition-colors"
          style={{ backgroundColor: `color-mix(in srgb, ${active.color} 14%, transparent)`, color: active.color }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Privacy mode: ${active.label}${openCountdown ? `, reverts in ${openCountdown}` : ''}. Tap to change.`}
        >
          <i className={`ti ${active.icon}`} style={{ fontSize: 17 }} aria-hidden="true" />
        </button>
        {openCountdown && (
          <span
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1 rounded-full whitespace-nowrap"
            style={{ backgroundColor: 'var(--color-open)', color: '#fff' }}
          >
            {openCountdown}
          </span>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 z-50 w-40 bg-surface border border-theme rounded-xl shadow-2xl overflow-hidden"
            >
              {MODE_ORDER.map((m) => {
                const { label, icon, color } = MODE[m];
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(m)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-left ${isActive ? 'bg-surface-2' : ''}`}
                  >
                    <i className={`ti ${icon}`} style={{ fontSize: 16, color }} aria-hidden="true" />
                    <span className="flex-1 text-primary">{label}</span>
                    {isActive && (
                      <i
                        className="ti ti-check text-[var(--color-primary)]"
                        style={{ fontSize: 15 }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* PIN modal — centered */}
      {step === 'pin' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-6 bg-black/40" onClick={handleClose}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 bg-surface" onClick={(e) => e.stopPropagation()}>
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-4"
              style={{ backgroundColor: 'var(--color-primary-light)' }}
            >
              <i className="ti ti-lock-open text-[#00a86b]" style={{ fontSize: 24 }} aria-hidden="true" />
            </div>

            <h3 className="text-lg font-semibold text-center mb-1 text-primary">Switch to Open mode</h3>
            <p className="text-sm text-center mb-5 text-secondary">Enter your PIN to reveal all financial values.</p>

            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handlePinConfirm();
                if (e.key === 'Escape') handleClose();
              }}
              placeholder="6-digit PIN"
              className="w-full text-center text-2xl tracking-widest rounded-xl px-4 py-3 mb-2 focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface border"
              aria-label="PIN"
            />

            {pinError && <p className="text-red-500 text-sm text-center mb-1">{pinError}</p>}

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl text-sm font-medium border border-theme text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => void handlePinConfirm()}
                disabled={pinInput.length !== 6 || verifying}
                className="flex-1 py-3 rounded-xl text-white text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {verifying ? 'Verifying…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning modal — shown after PIN verified, before mode switches to open */}
      {step === 'warning' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-6 bg-black/50">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 bg-surface">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mx-auto mb-4">
              <i className="ti ti-alert-triangle text-red-500" style={{ fontSize: 24 }} aria-hidden="true" />
            </div>

            <h3 className="text-lg font-semibold text-center mb-3 text-primary">Before switching to Open mode</h3>

            <div className="rounded-xl px-4 py-3 mb-5" style={{ backgroundColor: '#dc2626' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#ffffff' }}>
                Make sure no one can see your screen — check that you are not on a screen share, video call, or in a
                public place where someone could be looking over your shoulder. All your financial details including
                amounts, account information, and portfolio holdings will be fully visible to anyone who can see your
                screen.
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold mb-3"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmOpen}
              className="w-full py-2.5 rounded-xl border border-amber-400 text-amber-600 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'transparent' }}
            >
              I'm sure, switch to Open
            </button>
          </div>
        </div>
      )}
    </>
  );
}
