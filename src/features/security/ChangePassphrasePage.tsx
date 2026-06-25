import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, TextInput, Banner, PassphraseStrengthMeter } from '@/components/ui';
import { changePassphrase } from '@/core/crypto/securityManager';
import { usePassphraseStrength } from '@/hooks/usePassphraseStrength';
import { PATHS } from '@/router/paths';

export function ChangePassphrasePage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const { score } = usePassphraseStrength(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && score >= 3 && next === confirm && current !== next && !saving && !done;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    const result = await changePassphrase(current, next);
    if (result === 'ok') {
      setDone(true);
      setTimeout(() => navigate(PATHS.app.home), 1200);
    } else if (result === 'wrong_passphrase') {
      setError('Your current passphrase is incorrect.');
      setSaving(false);
    } else {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Change Passphrase"
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
          Your passphrase protects your encryption key. Changing it re-wraps the key instantly — your data is never
          re-encrypted, and your old passphrase stops working.
        </p>

        {done ? (
          <Banner variant="success">Passphrase changed. Keep it safe — there is no way to recover it if lost.</Banner>
        ) : (
          <>
            <TextInput
              label="Current passphrase"
              type="password"
              value={current}
              onChange={setCurrent}
              placeholder="Enter current passphrase"
            />

            <div>
              <div className="relative">
                <TextInput
                  label="New passphrase"
                  type={showNew ? 'text' : 'password'}
                  value={next}
                  onChange={setNext}
                  placeholder="Use a phrase you'll remember"
                  error={current.length > 0 && current === next ? 'New passphrase must be different' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-9 text-tertiary"
                  aria-label={showNew ? 'Hide passphrase' : 'Show passphrase'}
                >
                  <i
                    className={`ti ${showNew ? 'ti-eye-off' : 'ti-eye'}`}
                    style={{ fontSize: 18 }}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {next.length > 0 && <PassphraseStrengthMeter score={score} />}
            </div>

            <TextInput
              label="Confirm new passphrase"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Re-enter your new passphrase"
              error={mismatch ? "Passphrases don't match" : undefined}
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
              {saving ? 'Updating…' : 'Change Passphrase'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
