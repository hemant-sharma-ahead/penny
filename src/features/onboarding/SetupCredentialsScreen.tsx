import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exitDemoMode, initialize, isWeakPin } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import { accountsRepo } from '@/core/db/repositories';
import { ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import { claimAccount } from '@/core/identity/claim';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import type { Account, Profile } from '@/core/db/types';
import { usePassphraseStrength } from '@/hooks/usePassphraseStrength';
import { PATHS } from '@/router/paths';
import { Button, TextInput, PassphraseStrengthMeter } from '@/components/ui';
import { useOnboardingDraft } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';
import { useRedirectIfOnboarded } from './useRedirectIfOnboarded';

/**
 * The final "real vault" step — reached either fresh (Account Start → "Start fresh" → Let us know you →
 * …) or via Exit Demo Mode. Same fields/flow either way, per design: a brand-new user never sees a
 * "current credential" prompt. Under the hood the two paths diverge — fresh calls initialize(); exiting
 * Demo Mode re-keys the already-unlocked demo vault via exitDemoMode(), which also makes the demo
 * PIN/passphrase stop working immediately (old wrapping deleted, same as any other re-wrap).
 */
export function SetupCredentialsScreen() {
  const draft = useOnboardingDraft();
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  // Legitimate to reach this screen with onboarding already "complete" only via Exit Demo Mode
  // (the demo vault counts as complete) — any other stray arrival with an existing vault bounces away.
  const checking = useRedirectIfOnboarded(!!draft.fromDemoMode);

  const { score } = usePassphraseStrength(passphrase);

  const pinMismatch = confirmPin.length === 6 && pin !== confirmPin;
  const pinTooWeak = pin.length === 6 && isWeakPin(pin);
  const canProceed = score >= 3 && pin.length === 6 && !pinTooWeak && pin === confirmPin && !loading;

  async function writeProfileAndAccounts() {
    const now = Date.now();
    const repo = new EncryptedRepository<Profile>(db.profile as never);

    // Exiting Demo Mode: the profile record already exists (written blank by DemoVaultScreen) — update
    // it in place rather than creating a second one. Fresh setup: create it now, same as always.
    const existing = draft.fromDemoMode ? (await repo.getAll())[0] : undefined;
    await repo.put({
      id: existing?.id ?? crypto.randomUUID(),
      displayName: draft.fullName?.trim() ?? '',
      currency: 'INR',
      locale: 'en-IN',
      onboardingComplete: true,
      userId: existing?.userId ?? crypto.randomUUID(),
      username: draft.username || undefined,
      dob: draft.dob || undefined,
      employmentType: draft.employmentType,
      maritalStatus: draft.maritalStatus,
      children: draft.children?.length ? draft.children : undefined,
      homeOwner: draft.homeOwner,
      riskAppetite: draft.riskAppetite,
      plan: 'free',
      demoSeeded: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    for (const acc of draft.accountsToCreate ?? []) {
      const meta = ACCOUNT_TYPE_META[acc.type];
      const account: Account = {
        id: crypto.randomUUID(),
        name: acc.name,
        type: acc.type,
        openingBalance: acc.openingBalance,
        color: meta.color,
        icon: meta.icon,
        includeInNetWorth: acc.type !== 'credit_card',
        isArchived: false,
        createdAt: now,
        updatedAt: now
      };
      await accountsRepo.put(account);
    }

    // Claim the chosen handle on the server so the account is real from the start (sync builds) — sets
    // deviceId + uploads the recovery verifier, so Groups work immediately. Best-effort: offline just
    // defers it (Profile shows a Claim button). Availability was checked on the Let us know you screen.
    if (hasEntitlement('sync') && draft.username) {
      await claimAccount(draft.username).catch(() => undefined);
    }
  }

  const handleCreate = async () => {
    if (!canProceed) return;
    setLoading(true);
    setError('');
    try {
      if (draft.fromDemoMode) {
        const result = await exitDemoMode(passphrase, pin);
        if (result !== 'ok') {
          setError('Setup failed. Please try again.');
          setLoading(false);
          return;
        }
      } else {
        await initialize(passphrase, pin);
      }
      await writeProfileAndAccounts();
      navigate(draft.backupChoice === 'google-drive' ? PATHS.app.backup : PATHS.app.home);
    } catch {
      setError('Setup failed. Please try again.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-[#00a86b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.backupSetup} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-lock-square text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Set up your vault</h2>
          <p className="text-sm text-secondary">
            This is the one that matters — a random key encrypts everything, and your passphrase is the only way to
            recover it.
          </p>
        </div>

        {/* Passphrase */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-secondary mb-1">Passphrase</label>
          <p className="text-xs text-tertiary mb-2">
            Your master key — it locks everything and is the only way to recover your data. Make it strong and
            memorable.
          </p>
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

          {/* Passphrase-specific warning — sits with the field it's about. */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-3">
            <p className="text-xs text-amber-600 leading-relaxed">
              <strong>Important:</strong> If you forget your passphrase, your data can't be recovered — there's no
              backdoor or key escrow, by design. Write it down somewhere safe.
            </p>
          </div>
        </div>

        {/* PIN */}
        <div className="mb-1">
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
        <p className="text-xs text-tertiary mb-4">
          A quick shortcut to unlock on this device — your passphrase stays your real protection.
        </p>

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

        {error && <p className="text-danger text-sm mb-4 text-center">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canProceed}
          loading={loading}
          onClick={() => void handleCreate()}
        >
          {loading ? 'Encrypting your vault…' : 'Create my vault'}
        </Button>

        <p className="text-xs text-tertiary text-center mt-3">
          Setup runs 600,000 rounds of key derivation on your passphrase — that's why it takes a moment.
        </p>
        <p className="text-xs text-tertiary text-center mt-2">
          You can change your passphrase or PIN anytime in Settings — it re-locks your data instantly, without
          re-encrypting it.
        </p>
      </div>
    </div>
  );
}
