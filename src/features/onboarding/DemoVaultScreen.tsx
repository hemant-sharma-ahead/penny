import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Banner } from '@/components/ui';
import { DEMO_PASSPHRASE, DEMO_PIN, initialize } from '@/core/crypto/securityManager';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import { seedDemoData } from '@/core/db/seedDemoData';
import type { Profile } from '@/core/db/types';
import { PATHS } from '@/router/paths';
import { OnboardingBack } from './OnboardingBack';

/**
 * A known, shown, throwaway vault — lets "Explore with Demo Data" skip straight into a fully-populated
 * app without inventing real credentials. Nothing here is ever validated (isWeakPin, strength meter):
 * it's wiped along with the sample data the moment the user exits Demo Mode (see exitDemoMode()).
 */
export function DemoVaultScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    setLoading(true);
    setError('');
    try {
      await initialize(DEMO_PASSPHRASE, DEMO_PIN);
      const now = Date.now();
      const repo = new EncryptedRepository<Profile>(db.profile as never);
      await repo.put({
        id: crypto.randomUUID(),
        displayName: '',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        userId: crypto.randomUUID(),
        plan: 'free',
        createdAt: now,
        updatedAt: now
      });
      await seedDemoData();
      navigate(PATHS.app.home);
    } catch {
      setError('Something went wrong setting up the demo. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.simulatedDashboard} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#7c3aed' }}
          >
            <i className="ti ti-flask text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">You're exploring in Demo Mode</h2>
          <p className="text-secondary text-sm">
            We've set a temporary PIN and passphrase just so the sample data can be encrypted like the real thing.
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div className="bg-surface-2 border border-theme rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-tertiary uppercase tracking-wide mb-1">Temporary PIN</p>
            <p className="text-sm font-mono font-semibold text-primary tracking-widest">{DEMO_PIN}</p>
          </div>
          <div className="bg-surface-2 border border-theme rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-tertiary uppercase tracking-wide mb-1">Temporary passphrase</p>
            <p className="text-sm font-mono font-semibold text-primary">{DEMO_PASSPHRASE}</p>
          </div>
        </div>

        <Banner variant="info" className="mb-6">
          Nothing here is real. You'll choose your own PIN and passphrase when you're ready to use Penny for real — this
          one is cleared along with the sample data.
        </Banner>

        {error && <p className="text-danger text-sm mb-4 text-center">{error}</p>}

        <Button variant="primary" size="lg" fullWidth loading={loading} onClick={() => void handleContinue()}>
          Continue exploring
        </Button>
      </div>
    </div>
  );
}
