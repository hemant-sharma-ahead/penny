import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initialize, isWeakPin } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import { seedDemoData } from '@/core/db/seedDemoData';
import type { Profile } from '@/core/db/types';
import { usePassphraseStrength } from '@/hooks/usePassphraseStrength';
import { PATHS } from '@/router/paths';
import { Button, TextInput, PassphraseStrengthMeter } from '@/components/ui';
import { useOnboardingDraft } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';

export function SetupCredentialsScreen() {
  const draft = useOnboardingDraft();
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { score } = usePassphraseStrength(passphrase);

  const pinMismatch = confirmPin.length === 6 && pin !== confirmPin;
  const pinTooWeak = pin.length === 6 && isWeakPin(pin);
  const canProceed = score >= 3 && pin.length === 6 && !pinTooWeak && pin === confirmPin && !loading;

  const handleCreate = async () => {
    if (!canProceed) return;
    setLoading(true);
    setError('');
    try {
      await initialize(passphrase, pin);
      // Encryption is now live — persist the collected profile + local identity, then seed demo data.
      const now = Date.now();
      const repo = new EncryptedRepository<Profile>(db.profile as never);
      await repo.put({
        id: crypto.randomUUID(),
        displayName: draft.fullName?.trim() ?? '',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        userId: crypto.randomUUID(), // stable local identity anchor (claimed on the server in Phase 1.5)
        username: draft.username || undefined,
        dob: draft.dob || undefined,
        employmentType: draft.employmentType,
        plan: 'free',
        createdAt: now,
        updatedAt: now
      });
      await seedDemoData(draft.employmentType ?? 'salaried');
      navigate(PATHS.app.home);
    } catch {
      setError('Setup failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.letUsKnowYou} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-lock-square text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Set up your vault</h2>
          <p className="text-sm text-secondary">Your passphrase encrypts everything. It never leaves your device.</p>
        </div>

        {/* Passphrase */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-secondary mb-1.5">Passphrase</label>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Use a phrase you'll remember"
              className="input-surface w-full border rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
              aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            >
              <i className={`ti ${showPassphrase ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 18 }} />
            </button>
          </div>

          {/* Strength meter */}
          {passphrase.length > 0 && <PassphraseStrengthMeter score={score} />}
        </div>

        {/* PIN */}
        <div className="mb-4">
          <TextInput
            label="6-digit PIN"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(v) => setPin(v.replace(/\D/g, ''))}
            placeholder="For quick unlock"
            inputClassName="text-center tracking-widest text-lg"
            error={pinTooWeak ? 'Choose a less predictable PIN' : undefined}
          />
        </div>

        {/* Confirm PIN */}
        <div className="mb-6">
          <TextInput
            label="Confirm PIN"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            onChange={(v) => setConfirmPin(v.replace(/\D/g, ''))}
            placeholder="Repeat your PIN"
            inputClassName="text-center tracking-widest text-lg"
            error={pinMismatch ? "PINs don't match" : undefined}
          />
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-amber-600 leading-relaxed">
            <strong>Important:</strong> If you forget your passphrase, your data cannot be recovered. There is no key
            escrow, by design.
          </p>
        </div>

        {error && <p className="text-danger text-sm mb-4 text-center">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canProceed}
          loading={loading}
          onClick={() => void handleCreate()}
        >
          {loading ? 'Encrypting your vault…' : 'Create vault'}
        </Button>

        <p className="text-xs text-tertiary text-center mt-3">
          This takes a few seconds — we use 600,000 rounds of key derivation for your security.
        </p>
      </div>
    </div>
  );
}
