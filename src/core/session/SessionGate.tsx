import { useEffect, useState } from 'react';
import { keystore } from '@/core/crypto/keystore';
import { unlock } from '@/core/crypto/securityManager';
import { recordActivity, startSessionWatcher, stopSessionWatcher } from './sessionStore';

interface Props {
  children: React.ReactNode;
  onNeedsOnboarding: () => void;
  showRotationBanner?: boolean;
}

// Initial lock state is read synchronously from the keystore — no async on mount.
// setLocked(true) is called via the session watcher callback, not directly in an effect.
export function SessionGate({ children, showRotationBanner = false }: Props) {
  const [locked, setLocked] = useState(!keystore.isUnlocked());
  const [rotationDismissed, setRotationDismissed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    // setLocked called from callback (event handler), not directly in effect body ✓
    startSessionWatcher(() => setLocked(true));
    const handleActivity = () => recordActivity();
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      stopSessionWatcher();
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  const handleUnlock = async () => {
    setError('');
    const result = await unlock(pinInput);
    setPinInput('');
    if (result === 'ok') {
      setLocked(false);
    } else if (result === 'locked_out') {
      setLockedUntil(Date.now() + 5 * 60 * 1000);
      setError('Too many attempts. Try again later.');
    } else {
      setError('Incorrect PIN. Try again.');
    }
  };

  if (locked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <i className="ti ti-lock text-amber-500" style={{ fontSize: 32 }} aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Session locked</h2>
          <p className="text-slate-500 text-sm mb-8">Enter your PIN to continue</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleUnlock();
            }}
            placeholder="6-digit PIN"
            className="w-full text-center text-2xl tracking-widest border border-slate-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            aria-label="PIN"
          />
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          {lockedUntil && (
            <p className="text-slate-400 text-xs mb-4">
              Locked until {new Date(lockedUntil).toLocaleTimeString('en-IN')}
            </p>
          )}
          <button
            onClick={() => void handleUnlock()}
            disabled={pinInput.length !== 6}
            className="w-full py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showRotationBanner && !rotationDismissed && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
          <i className="ti ti-refresh-alert text-amber-600" style={{ fontSize: 18 }} aria-hidden="true" />
          <p className="text-amber-800 text-xs flex-1">PIN rotation recommended — it has been 21+ days</p>
          <button onClick={() => setRotationDismissed(true)} className="text-amber-600 text-xs font-medium">
            Dismiss
          </button>
        </div>
      )}
      {children}
    </>
  );
}
