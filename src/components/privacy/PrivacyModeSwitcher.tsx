import { useState, useRef, useEffect } from 'react';
import { usePrivacy, type PrivacyMode } from '@/context/PrivacyContext';
import { verifyPin } from '@/core/crypto/securityManager';

const SEGMENTS: { mode: PrivacyMode; label: string }[] = [
  { mode: 'safe', label: 'Safe' },
  { mode: 'privacy', label: 'Private' },
  { mode: 'open', label: 'Open' }
];

const MODE_COLORS: Record<PrivacyMode, { active: string }> = {
  safe: { active: 'bg-amber-500' },
  privacy: { active: 'bg-violet-600' },
  open: { active: 'bg-[#00a86b]' }
};

type Step = null | 'pin' | 'warning';

export function PrivacyModeSwitcher() {
  const { mode, setMode } = usePrivacy();
  const [step, setStep] = useState<Step>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'pin') {
      const t = setTimeout(() => pinInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  const handleSegmentTap = (target: PrivacyMode) => {
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
    const ok = await verifyPin(pinInput);
    setVerifying(false);
    if (ok) {
      setPinInput('');
      setStep('warning');
    } else {
      setPinError('Incorrect PIN');
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
      {/* 3-segment toggle */}
      <div className="flex items-center rounded-lg overflow-hidden p-0.5 gap-0.5 border border-theme bg-surface-2">
        {SEGMENTS.map(({ mode: seg, label }) => {
          const isActive = mode === seg;
          return (
            <button
              key={seg}
              onClick={() => handleSegmentTap(seg)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                isActive ? `${MODE_COLORS[seg].active} text-white shadow-sm` : 'text-tertiary hover:text-secondary'
              }`}
              aria-pressed={isActive}
              aria-label={`${label} mode`}
            >
              {label}
            </button>
          );
        })}
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

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
              <p className="text-sm text-red-500 leading-relaxed">
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
