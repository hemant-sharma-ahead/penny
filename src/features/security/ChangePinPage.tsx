import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, PageHeader, TextInput, Banner } from '@/components/ui';
import { changePin, isWeakPin, resetPinWithPassphrase } from '@/core/crypto/securityManager';
import { PATHS } from '@/router/paths';

const isSixDigits = (v: string) => /^\d{6}$/.test(v);

export function ChangePinPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Reached via SessionGate's "Forgot PIN?" recovery — only possible once PIN attempts were
  // exhausted, so this is always a genuine recovery and the screen is made non-dismissible below.
  const forced = !!(location.state as { forcedPinReset?: boolean } | null)?.forcedPinReset;

  const [viaPassphrase, setViaPassphrase] = useState(forced);
  const [current, setCurrent] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Non-dismissible while forced: trap the browser/gesture back button until the PIN is reset.
  // AppShell separately hides the header settings button + bottom nav for this same condition.
  useEffect(() => {
    if (!forced || done) return;
    history.pushState(null, '', location.pathname);
    const onPopState = () => history.pushState(null, '', location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [forced, done, location.pathname]);

  const onlyDigits = (v: string) => v.replace(/\D/g, '');
  const mismatch = confirm.length === 6 && next !== confirm;
  const sameAsCurrent = !viaPassphrase && isSixDigits(next) && next === current;
  const weakNew = isSixDigits(next) && isWeakPin(next);
  const newPinError = sameAsCurrent
    ? 'New PIN must be different from the current one'
    : weakNew
      ? 'Choose a less predictable PIN'
      : undefined;
  const canSubmit = viaPassphrase
    ? passphrase.length > 0 && isSixDigits(next) && next === confirm && !weakNew && !saving && !done
    : isSixDigits(current) && isSixDigits(next) && next === confirm && !sameAsCurrent && !weakNew && !saving && !done;

  async function handleSubmitViaPassphrase() {
    const result = await resetPinWithPassphrase(passphrase, next);
    switch (result.status) {
      case 'ok':
        setDone(true);
        setTimeout(() => navigate(PATHS.app.home), 1200);
        return;
      case 'wrong_passphrase': {
        const n = result.attemptsRemaining ?? 0;
        setError(`Your passphrase is incorrect${n > 0 ? ` — ${n} attempt${n === 1 ? '' : 's'} left` : ''}.`);
        break;
      }
      case 'locked_out':
        setError('Too many incorrect attempts. Try again later.');
        break;
      case 'weak_pin':
        setError('Choose a less predictable PIN.');
        break;
      case 'wiped':
        navigate(PATHS.onboarding.splash);
        return;
      default:
        setError('Something went wrong. Please try again.');
    }
    setSaving(false);
  }

  async function handleSubmitViaPin() {
    const result = await changePin(current, next);
    switch (result.status) {
      case 'ok':
        setDone(true);
        setTimeout(() => navigate(PATHS.app.home), 1200);
        return;
      case 'wrong_pin': {
        const n = result.attemptsRemaining ?? 0;
        setError(`Your current PIN is incorrect${n > 0 ? ` — ${n} attempt${n === 1 ? '' : 's'} left` : ''}.`);
        break;
      }
      case 'locked_out':
        setError('Too many incorrect attempts. Try again later.');
        break;
      case 'too_soon':
        setError('You can only change your PIN once a day. Please try again later.');
        break;
      case 'weak_pin':
        setError('Choose a less predictable PIN.');
        break;
      case 'wiped':
        navigate(PATHS.onboarding.splash);
        return;
      default:
        setError('Something went wrong. Please try again.');
    }
    setSaving(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    if (viaPassphrase) await handleSubmitViaPassphrase();
    else await handleSubmitViaPin();
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Change PIN"
        leading={
          forced ? undefined : (
            <Button
              variant="ghost"
              icon="ti-arrow-left"
              aria-label="Back"
              className="w-8 h-8 rounded-lg hover:text-primary"
              onClick={() => navigate(-1)}
            />
          )
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
        {forced ? (
          <Banner variant="warning">
            Your PIN was locked after too many incorrect attempts. Set a new one to continue — enter your passphrase
            once more to confirm it.
          </Banner>
        ) : (
          <p className="text-sm text-secondary">
            Your PIN unlocks the app quickly. Changing it re-wraps your encryption key — your data is never
            re-encrypted.
          </p>
        )}

        {done ? (
          <Banner variant="success">PIN changed. Use your new PIN next time you unlock.</Banner>
        ) : (
          <>
            {viaPassphrase ? (
              <TextInput
                label="Current passphrase"
                type="password"
                value={passphrase}
                onChange={setPassphrase}
                placeholder="Enter your passphrase"
              />
            ) : (
              <TextInput
                label="Current PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={current}
                onChange={(v) => setCurrent(onlyDigits(v))}
                placeholder="Enter current 6-digit PIN"
                inputClassName="text-center tracking-widest text-lg"
              />
            )}

            {!forced && (
              <button
                type="button"
                onClick={() => {
                  setViaPassphrase((v) => !v);
                  setCurrent('');
                  setPassphrase('');
                  setError('');
                }}
                className="text-secondary text-xs font-medium underline self-start -mt-2"
              >
                {viaPassphrase ? 'Use current PIN instead' : 'Forgot your PIN? Use your passphrase instead'}
              </button>
            )}

            <TextInput
              label="New PIN"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={next}
              onChange={(v) => setNext(onlyDigits(v))}
              placeholder="Choose a new 6-digit PIN"
              inputClassName="text-center tracking-widest text-lg"
              error={newPinError}
            />
            <TextInput
              label="Confirm PIN"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(v) => setConfirm(onlyDigits(v))}
              placeholder="Re-enter your new PIN"
              inputClassName="text-center tracking-widest text-lg"
              error={mismatch ? "PINs don't match" : undefined}
            />

            {error && <p className="text-danger text-sm text-center">{error}</p>}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmit}
              loading={saving}
              onClick={() => void handleSubmit()}
            >
              {saving ? 'Updating…' : 'Change PIN'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
