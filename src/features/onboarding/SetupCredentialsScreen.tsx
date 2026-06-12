import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import zxcvbn from 'zxcvbn';
import { initialize } from '@/core/crypto/securityManager';
import { PATHS } from '@/router/paths';

const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const strengthColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];

export function SetupCredentialsScreen() {
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const strength = useMemo(() => (passphrase ? zxcvbn(passphrase) : null), [passphrase]);
  const score: number = strength?.score ?? 0;

  const pinMismatch = confirmPin.length === 6 && pin !== confirmPin;
  const canProceed = score >= 3 && pin.length === 6 && pin === confirmPin && !loading;

  const handleCreate = async () => {
    if (!canProceed) return;
    setLoading(true);
    setError('');
    try {
      await initialize(passphrase, pin);
      navigate(PATHS.onboarding.privacyDemo);
    } catch {
      setError('Setup failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white px-6 py-10">
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-lock-square text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Set up your vault</h2>
          <p className="text-slate-500 text-sm">Your passphrase encrypts everything. It never leaves your device.</p>
        </div>

        {/* Passphrase */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Passphrase</label>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Use a phrase you'll remember"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            >
              <i className={`ti ${showPassphrase ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 18 }} />
            </button>
          </div>

          {/* Strength meter */}
          {passphrase.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? strengthColors[score] : 'bg-slate-200'}`}
                  />
                ))}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">{strengthLabels[score]}</span>
                {score < 3 && <span className="text-xs text-amber-600">Need a stronger passphrase</span>}
              </div>
            </div>
          )}
        </div>

        {/* PIN */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">6-digit PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="For quick unlock"
            className="w-full text-center tracking-widest border border-slate-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            aria-label="PIN"
          />
        </div>

        {/* Confirm PIN */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Repeat your PIN"
            className={`w-full text-center tracking-widest border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-[#00a86b] ${pinMismatch ? 'border-red-300' : 'border-slate-200'}`}
            aria-label="Confirm PIN"
          />
          {pinMismatch && <p className="text-xs text-red-500 mt-1">PINs don't match</p>}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Important:</strong> If you forget your passphrase, your data cannot be recovered. There is no key
            escrow, by design.
          </p>
        </div>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <button
          onClick={() => void handleCreate()}
          disabled={!canProceed}
          className="w-full py-3.5 rounded-xl font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Encrypting your vault…
            </>
          ) : (
            'Create vault'
          )}
        </button>

        <p className="text-xs text-slate-400 text-center mt-3">
          This takes a few seconds — we use 600,000 rounds of key derivation for your security.
        </p>
      </div>
    </div>
  );
}
