import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, TextInput, Banner } from '@/components/ui';
import { changePin, isWeakPin } from '@/core/crypto/securityManager';
import { PATHS } from '@/router/paths';

const isSixDigits = (v: string) => /^\d{6}$/.test(v);

export function ChangePinPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, '');
  const mismatch = confirm.length === 6 && next !== confirm;
  const sameAsCurrent = isSixDigits(next) && next === current;
  const weakNew = isSixDigits(next) && isWeakPin(next);
  const newPinError = sameAsCurrent
    ? 'New PIN must be different from the current one'
    : weakNew
      ? 'Choose a less predictable PIN'
      : undefined;
  const canSubmit =
    isSixDigits(current) && isSixDigits(next) && next === confirm && !sameAsCurrent && !weakNew && !saving && !done;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
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

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Change PIN"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
        <p className="text-sm text-secondary">
          Your PIN unlocks the app quickly. Changing it re-wraps your encryption key — your data is never re-encrypted.
        </p>

        {done ? (
          <Banner variant="success">PIN changed. Use your new PIN next time you unlock.</Banner>
        ) : (
          <>
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
              label="Confirm new PIN"
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
