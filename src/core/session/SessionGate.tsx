import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keystore } from '@/core/crypto/keystore';
import {
  getLockoutState,
  getPassphraseLockoutState,
  lockSession,
  unlock,
  unlockWithPassphrase
} from '@/core/crypto/securityManager';
import { loadLockOnBackground } from '@/context/SettingsContext';
import { PATHS } from '@/router/paths';
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
export function SessionGate({ children, onNeedsOnboarding, showRotationBanner = false }: Props) {
  const navigate = useNavigate();
  const [locked, setLocked] = useState(!keystore.isUnlocked());
  const [rotationDismissed, setRotationDismissed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  // tickNow drives the live countdown — updated every second while locked out.
  const [tickNow, setTickNow] = useState(() => Date.now());

  // Forgot-PIN recovery: only reachable once PIN attempts are exhausted (isLockedOut below). A
  // separate, independent attempt counter/lockout from the PIN's — see securityManager.ts.
  const [recovering, setRecovering] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [passphraseAttemptsUsed, setPassphraseAttemptsUsed] = useState(0);
  const [passphraseLockedUntil, setPassphraseLockedUntil] = useState<number | null>(null);
  const [passphraseVerifying, setPassphraseVerifying] = useState(false);

  // Derived: countdown string computed from lockedUntil and tickNow (no extra state).
  const countdownMs = lockedUntil ? Math.max(0, lockedUntil - tickNow) : 0;
  const countdown = countdownMs > 0 ? formatCountdown(countdownMs) : '';
  const passphraseCountdownMs = passphraseLockedUntil ? Math.max(0, passphraseLockedUntil - tickNow) : 0;
  const passphraseCountdown = passphraseCountdownMs > 0 ? formatCountdown(passphraseCountdownMs) : '';

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

  // Read real passphrase-recovery lockout state whenever the recovery screen opens.
  useEffect(() => {
    if (!recovering) return;
    getPassphraseLockoutState()
      .then((state) => {
        if (!state) return;
        setPassphraseAttemptsUsed(state.passphraseAttempts);
        if (state.lockedUntil && state.lockedUntil > Date.now()) {
          setPassphraseLockedUntil(state.lockedUntil);
        }
      })
      .catch(() => {});
  }, [recovering]);

  // Live countdown ticker — clears passphraseLockedUntil when it expires.
  useEffect(() => {
    if (!passphraseLockedUntil) return;
    const target = passphraseLockedUntil;
    const id = setInterval(() => {
      const now = Date.now();
      if (now >= target) {
        setPassphraseLockedUntil(null);
        setPassphraseAttemptsUsed(0);
      } else {
        setTickNow(now);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [passphraseLockedUntil]);

  useEffect(() => {
    // setLocked called from callback (event handler), not directly in effect body ✓
    startSessionWatcher(() => setLocked(true));
    const handleActivity = () => recordActivity();
    // Optional: lock the moment the app is backgrounded (opt-in setting).
    const handleVisibility = () => {
      if (document.hidden && loadLockOnBackground()) {
        lockSession();
        setLocked(true);
      }
    };
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopSessionWatcher();
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
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
    } else if (result === 'wiped') {
      onNeedsOnboarding(); // data erased after too many attempts — restart onboarding
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

  const handlePassphraseUnlock = async () => {
    if (passphraseLockedUntil || !passphraseInput) return;
    setPassphraseVerifying(true);
    setPassphraseError('');
    const result = await unlockWithPassphrase(passphraseInput);
    setPassphraseVerifying(false);
    setPassphraseInput('');
    if (result === 'ok') {
      // Route straight to setting a new PIN — never back into the app with the forgotten PIN
      // still active. ChangePinPage makes this step non-dismissible for this entry path.
      setLocked(false);
      navigate(PATHS.app.changePin, { state: { forcedPinReset: true } });
    } else if (result === 'wiped') {
      onNeedsOnboarding();
    } else if (result === 'locked_out') {
      getPassphraseLockoutState()
        .then((state) => {
          if (state?.lockedUntil) setPassphraseLockedUntil(state.lockedUntil);
          if (state) setPassphraseAttemptsUsed(state.passphraseAttempts);
        })
        .catch(() => {});
    } else {
      getPassphraseLockoutState()
        .then((state) => {
          if (state) setPassphraseAttemptsUsed(state.passphraseAttempts);
        })
        .catch(() => {});
      setPassphraseError('Incorrect passphrase.');
    }
  };

  if (locked) {
    const isLockedOut = !!lockedUntil;
    const remaining = MAX_ATTEMPTS - attemptsUsed;
    const showWarning = !isLockedOut && attemptsUsed >= 1 && remaining > 0;
    const passphraseIsLockedOut = !!passphraseLockedUntil;
    const passphraseRemaining = MAX_ATTEMPTS - passphraseAttemptsUsed;
    const showPassphraseWarning = !passphraseIsLockedOut && passphraseAttemptsUsed >= 1 && passphraseRemaining > 0;

    if (recovering) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-surface-3 px-6">
          <div className="w-full max-w-sm text-center">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                passphraseIsLockedOut ? 'bg-red-50' : 'bg-amber-50'
              }`}
            >
              <i
                className={`ti ti-key ${passphraseIsLockedOut ? 'text-red-500' : 'text-amber-500'}`}
                style={{ fontSize: 32 }}
                aria-hidden="true"
              />
            </div>

            <h2 className="text-xl font-semibold text-primary mb-2">
              {passphraseIsLockedOut ? 'Too many attempts' : 'Enter your passphrase'}
            </h2>
            <p className="text-secondary text-sm mb-8">
              {passphraseIsLockedOut
                ? `Try again in ${passphraseCountdown}`
                : "This unlocks the app so you can set a new PIN — you'll be asked for your passphrase again to confirm it."}
            </p>

            {!passphraseIsLockedOut && (
              <>
                <input
                  type="password"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handlePassphraseUnlock();
                  }}
                  placeholder="Your passphrase"
                  className="input-surface w-full text-center text-lg border border-theme rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  aria-label="Passphrase"
                  autoFocus
                />

                {passphraseError && <p className="text-red-500 text-sm mb-3">{passphraseError}</p>}

                {showPassphraseWarning && (
                  <div className="flex items-center justify-center gap-1.5 mb-4 text-amber-600">
                    <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} aria-hidden="true" />
                    <p className="text-xs">
                      {passphraseRemaining === 1
                        ? '1 attempt remaining before lockout'
                        : `${passphraseRemaining} attempts remaining before lockout`}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => void handlePassphraseUnlock()}
                  disabled={!passphraseInput || passphraseVerifying}
                  className="w-full py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 mb-3"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {passphraseVerifying ? 'Verifying…' : 'Unlock'}
                </button>
              </>
            )}

            {passphraseIsLockedOut && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center mb-3">
                <p className="text-xs text-red-400">For your security, passphrase entry is disabled temporarily.</p>
              </div>
            )}

            <button
              onClick={() => {
                setRecovering(false);
                setPassphraseInput('');
                setPassphraseError('');
              }}
              className="text-secondary text-sm font-medium"
            >
              Back to PIN
            </button>
          </div>
        </div>
      );
    }

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
            <>
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center mb-4">
                <p className="text-xs text-red-400">For your security, PIN entry is disabled temporarily.</p>
              </div>
              {/* Only reachable once PIN attempts are exhausted — every use of it is a genuine
                  recovery, so a successful passphrase unlock always forces a PIN reset. */}
              <button onClick={() => setRecovering(true)} className="text-secondary text-sm font-medium underline">
                Forgot PIN?
              </button>
            </>
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
