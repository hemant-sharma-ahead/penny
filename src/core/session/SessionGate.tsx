import { useEffect, useState } from 'react';
import { keystore } from '@/core/crypto/keystore';
import { getLockoutState, unlock } from '@/core/crypto/securityManager';
import { recordActivity, startSessionWatcher, stopSessionWatcher } from './sessionStore';

interface Props {
  children: React.ReactNode;
  onNeedsOnboarding: () => void;
  showRotationBanner?: boolean;
}

const MAX_ATTEMPTS = 5;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Initial lock state is read synchronously from the keystore — no async on mount.
// setLocked(true) is called via the session watcher callback, not directly in an effect.
export function SessionGate({ children, showRotationBanner = false }: Props) {
  const [locked, setLocked] = useState(!keystore.isUnlocked());
  const [rotationDismissed, setRotationDismissed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  // tickNow drives the live countdown — updated every second while locked out.
  const [tickNow, setTickNow] = useState(() => Date.now());

  // Derived: countdown string computed from lockedUntil and tickNow (no extra state).
  const countdownMs = lockedUntil ? Math.max(0, lockedUntil - tickNow) : 0;
  const countdown = countdownMs > 0 ? formatCountdown(countdownMs) : '';

  // Read real lockout state from DB whenever the screen becomes locked.
  useEffect(() => {
    if (!locked) return;
    getLockoutState()
      .then((state) => {
        if (!state) return;
        setAttemptsUsed(state.pinAttempts);
        if (state.lockedUntil && state.lockedUntil > Date.now()) {
          setLockedUntil(state.lockedUntil);
        }
      })
      .catch(() => {});
  }, [locked]);

  // Live countdown ticker — clears lockedUntil when it expires.
  useEffect(() => {
    if (!lockedUntil) return;
    const target = lockedUntil; // capture non-null for use inside interval
    const id = setInterval(() => {
      const now = Date.now();
      if (now >= target) {
        setLockedUntil(null);
        setAttemptsUsed(0);
      } else {
        setTickNow(now);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

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
    if (lockedUntil) return;
    setError('');
    const result = await unlock(pinInput);
    setPinInput('');
    if (result === 'ok') {
      setLocked(false);
      setAttemptsUsed(0);
    } else if (result === 'locked_out') {
      // Re-read DB for the real lockedUntil (exponential backoff computed there).
      getLockoutState()
        .then((state) => {
          if (state?.lockedUntil) setLockedUntil(state.lockedUntil);
          if (state) setAttemptsUsed(state.pinAttempts);
        })
        .catch(() => {});
    } else {
      // wrong_pin — read updated attempt count
      getLockoutState()
        .then((state) => {
          if (state) setAttemptsUsed(state.pinAttempts);
        })
        .catch(() => {});
      setError('Incorrect PIN.');
    }
  };

  if (locked) {
    const isLockedOut = !!lockedUntil;
    const remaining = MAX_ATTEMPTS - attemptsUsed;
    const showWarning = !isLockedOut && attemptsUsed >= 3 && remaining > 0;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-3 px-6">
        <div className="w-full max-w-sm text-center">
          {/* Icon */}
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
              isLockedOut ? 'bg-red-50' : 'bg-amber-50'
            }`}
          >
            <i
              className={`ti ti-lock ${isLockedOut ? 'text-red-500' : 'text-amber-500'}`}
              style={{ fontSize: 32 }}
              aria-hidden="true"
            />
          </div>

          {/* Title + subtitle */}
          <h2 className="text-xl font-semibold text-primary mb-2">
            {isLockedOut ? 'Too many attempts' : 'Session locked'}
          </h2>
          <p className="text-secondary text-sm mb-8">
            {isLockedOut ? `Try again in ${countdown}` : 'Enter your PIN to continue'}
          </p>

          {/* PIN input — hidden during lockout */}
          {!isLockedOut && (
            <>
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
                className="input-surface w-full text-center text-2xl tracking-widest border border-theme rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                aria-label="PIN"
                autoFocus
              />

              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

              {showWarning && (
                <div className="flex items-center justify-center gap-1.5 mb-4 text-amber-600">
                  <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} aria-hidden="true" />
                  <p className="text-xs">
                    {remaining === 1
                      ? '1 attempt remaining before lockout'
                      : `${remaining} attempts remaining before lockout`}
                  </p>
                </div>
              )}

              <button
                onClick={() => void handleUnlock()}
                disabled={pinInput.length !== 6}
                className="w-full py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Unlock
              </button>
            </>
          )}

          {/* Locked-out countdown bar */}
          {isLockedOut && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-red-400">For your security, PIN entry is disabled temporarily.</p>
            </div>
          )}
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
