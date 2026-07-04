import { useEffect, useState } from 'react';
import { checkUsername, claimAccount, UsernameTakenError } from '@/core/identity/claim';
import { isValidUsername } from '@/core/profile/username';
import { Button, TextInput } from '@/components/ui';

/**
 * Screen ④ of the account-start flow (Track F). Shown after a restore when the account was deregistered
 * and its old handle is no longer free. Everything is already restored + safe — only the public handle
 * needs changing. Rendered as a full-screen overlay by IdentityReconciler; not a route.
 */
export function ChooseHandleScreen({ oldHandle, onDone }: { oldHandle: string; onDone: () => void }) {
  // Seed with a suggested variant of the old handle (editable, deterministic). The live availability
  // check below tells the user if the suggestion (or their edit) is free.
  const suggestion = `${oldHandle.replace(/_+$/, '').slice(0, 18)}1`;
  const [value, setValue] = useState(suggestion);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Debounced availability check. State is only set inside the timeout / onChange (never directly in the
  // effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!isValidUsername(value)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setAvailability('checking');
      void checkUsername(value)
        .then((r) => !cancelled && setAvailability(r.available ? 'available' : 'taken'))
        .catch(() => !cancelled && setAvailability('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  function onChangeValue(v: string) {
    setValue(v.toLowerCase());
    setAvailability('idle');
  }

  async function handleClaim() {
    if (availability !== 'available' || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await claimAccount(value);
      onDone();
    } catch (err) {
      setError(err instanceof UsernameTakenError ? 'Just taken — try another.' : 'Could not claim. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-warning)' }}
          >
            <i className="ti ti-user-question text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Your handle is taken</h2>
          <p className="text-sm text-secondary">
            <span className="font-semibold text-primary">@{oldHandle}</span> is no longer available. Your data is
            restored and safe — just pick a new handle to finish.
          </p>
        </div>

        <TextInput
          label="New username"
          value={value}
          onChange={onChangeValue}
          placeholder="e.g. aarav_sharma"
          error={value.length > 0 && !isValidUsername(value) ? '3–20 lowercase letters, numbers, or _' : undefined}
          hint={
            availability === 'checking'
              ? 'Checking…'
              : availability === 'available'
                ? '✓ Available'
                : availability === 'taken'
                  ? 'Taken — try another'
                  : undefined
          }
        />

        {error && <p className="text-danger text-sm mt-3 text-center">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          disabled={availability !== 'available' || busy}
          loading={busy}
          onClick={() => void handleClaim()}
        >
          <i className="ti ti-shield-check" aria-hidden="true" /> Claim &amp; continue
        </Button>

        <div className="mt-4 flex items-start gap-2 text-xs text-secondary bg-info-subtle rounded-xl px-3 py-2.5">
          <i className="ti ti-info-circle text-info mt-0.5" aria-hidden="true" />
          <span>
            Only your public handle changes. Your data, encryption keys, and account are unchanged. Group members will
            see the new handle.
          </span>
        </div>
      </div>
    </div>
  );
}
