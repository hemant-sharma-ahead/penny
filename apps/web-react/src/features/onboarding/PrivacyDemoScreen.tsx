import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { encrypt, deriveKey, generateSalt } from '@/core/crypto/engine';
import { PATHS } from '@/router/paths';
import { Button } from '@/components/ui';
import { OnboardingBack } from './OnboardingBack';

const DEMO_SALT = generateSalt();
const DEFAULT_TEXT = 'My salary is ₹80,000 per month';

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function encryptText(text: string): Promise<string> {
  const key = await deriveKey('demo-key', DEMO_SALT, 1_000);
  const { iv, ciphertext: ct } = await encrypt(key, new TextEncoder().encode(text));
  return `${bufferToBase64(iv)}.${bufferToBase64(ct)}`;
}

export function PrivacyDemoScreen() {
  const [input, setInput] = useState(DEFAULT_TEXT);
  const [ciphertext, setCiphertext] = useState('');
  const [encrypting, setEncrypting] = useState(false);
  const navigate = useNavigate();
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    encryptText(DEFAULT_TEXT)
      .then((ct) => {
        if (!cancelRef.current) setCiphertext(ct);
      })
      .catch(() => {
        if (!cancelRef.current) setCiphertext('');
      });
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const handleChange = async (value: string) => {
    setInput(value);
    if (!value.trim()) {
      setCiphertext('');
      return;
    }
    setEncrypting(true);
    try {
      const ct = await encryptText(value);
      setCiphertext(ct);
    } catch {
      setCiphertext('');
    } finally {
      setEncrypting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.privacyPromise} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-eye-off text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">See encryption in action</h2>
          <p className="text-sm text-secondary">Type anything — watch it become unreadable ciphertext instantly.</p>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-tertiary mb-1.5 uppercase tracking-wide">Your text</label>
          <textarea
            value={input}
            onChange={(e) => void handleChange(e.target.value)}
            rows={3}
            className="input-surface w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] resize-none"
            placeholder="Type something sensitive…"
          />
        </div>

        {/* Ciphertext output */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-tertiary uppercase tracking-wide">What Penny stores</label>
            {encrypting && (
              <span className="text-tertiary text-xs flex items-center gap-1">
                <span className="w-3 h-3 border border-t-transparent border-theme rounded-full animate-spin" />
                Encrypting
              </span>
            )}
          </div>
          {/* Intentionally dark terminal-style box for ciphertext — theme-independent */}
          <div className="w-full min-h-[80px] bg-slate-900 rounded-xl px-4 py-3 font-mono text-xs text-emerald-400 break-all leading-relaxed">
            {ciphertext || (input ? '...' : 'Start typing above to see live encryption')}
          </div>
        </div>

        <div className="surface rounded-xl px-4 py-3 mb-8">
          <p className="text-xs text-secondary leading-relaxed">
            Every record is encrypted with a random key that never leaves your device — and that key is itself locked by
            your passphrase. Even if someone extracted your device storage, this is all they would see.
          </p>
        </div>

        <Button variant="primary" size="lg" fullWidth onClick={() => navigate(PATHS.onboarding.chipIntro)}>
          Got it — meet Chip
        </Button>
      </div>
    </div>
  );
}
