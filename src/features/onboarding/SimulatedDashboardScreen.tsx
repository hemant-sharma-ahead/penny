import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EncryptedRepository } from '@/core/db/repository';
import { db } from '@/core/db/schema';
import { seedDemoData } from '@/core/db/seedDemoData';
import type { Profile } from '@/core/db/types';
import { PATHS } from '@/router/paths';
import { Button } from '@/components/ui';

const mockNetWorth = '₹15,43,200';
const mockChange = '+₹23,400 this month';

export function SimulatedDashboardScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGetStarted = async () => {
    setLoading(true);
    setError('');
    try {
      const repo = new EncryptedRepository<Profile>(db.profile as never);
      await repo.put({
        id: crypto.randomUUID(),
        displayName: '',
        currency: 'INR',
        locale: 'en-IN',
        onboardingComplete: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      await seedDemoData();
      navigate(PATHS.app.home);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // Master key not in memory — onboarding already completed in a prior session.
      // Route to the app; SessionGate will handle the PIN unlock.
      if (msg.includes('master key') || msg.includes('Session locked')) {
        navigate(PATHS.app.home);
        return;
      }
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface-2 px-6 py-10">
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold text-primary mb-1">Here's a preview</h2>
          <p className="text-secondary text-sm">Sample data — your real numbers will look like this.</p>
        </div>

        {/* Net worth card */}
        <div className="rounded-2xl p-5 mb-4 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
          <p className="text-sm opacity-80 mb-1">Net worth</p>
          <p className="text-3xl font-semibold tracking-tight">{mockNetWorth}</p>
          <p className="text-sm opacity-70 mt-1 flex items-center gap-1">
            <i className="ti ti-trending-up" style={{ fontSize: 14 }} aria-hidden="true" />
            {mockChange}
          </p>
        </div>

        {/* Module tiles */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { icon: 'ti-chart-pie', label: 'Portfolio', value: '₹9,80,000', sub: '5 holdings' },
            { icon: 'ti-wallet', label: 'Expenses', value: '₹42,300', sub: 'this month' },
            { icon: 'ti-target', label: 'Goals', value: '2 active', sub: '1 on track' },
            { icon: 'ti-shield', label: 'Insurance', value: '₹1.5Cr', sub: 'coverage' }
          ].map((tile) => (
            <div key={tile.label} className="surface rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <i className={`ti ${tile.icon} text-[#00a86b]`} style={{ fontSize: 16 }} aria-hidden="true" />
                <span className="text-xs font-medium text-secondary">{tile.label}</span>
              </div>
              <p className="text-sm font-semibold text-primary">{tile.value}</p>
              <p className="text-xs text-tertiary">{tile.sub}</p>
            </div>
          ))}
        </div>

        {/* Chip insight */}
        <div className="surface rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <i className="ti ti-sparkles text-white" style={{ fontSize: 12 }} aria-hidden="true" />
            </div>
            <span className="text-xs font-medium text-secondary">Chip insight</span>
          </div>
          <p className="text-sm text-primary leading-relaxed">
            Your emergency fund covers 2.1 months of expenses. Building it to 6 months would improve your financial
            health score by 18 points.
          </p>
        </div>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <Button variant="primary" size="lg" fullWidth loading={loading} onClick={() => void handleGetStarted()}>
          {loading ? 'Setting up…' : 'Set up my dashboard'}
        </Button>
      </div>
    </div>
  );
}
