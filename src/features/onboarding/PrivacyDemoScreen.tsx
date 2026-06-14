import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { encrypt, deriveKey, generateSalt } from '@/core/crypto/engine';
import { PATHS } from '@/router/paths';

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
    <div className="min-h-screen flex flex-col px-6 py-10" style={{ backgroundColor: 'var(--color-surface)' }}>
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-eye-off text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            See encryption in action
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Type anything — watch it become unreadable ciphertext instantly.
          </p>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label
            className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Your text
          </label>
          <textarea
            value={input}
            onChange={(e) => void handleChange(e.target.value)}
            rows={3}
            className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] resize-none"
            style={{
              backgroundColor: 'var(--color-surface-secondary)',
              color: 'var(--color-text-primary)',
              borderColor: 'var(--color-border)'
            }}
            placeholder="Type something sensitive…"
          />
        </div>

        {/* Ciphertext output */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <label
              className="block text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              What Penny stores
            </label>
            {encrypting && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-tertiary)' }}>
                <span
                  className="w-3 h-3 border border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'var(--color-text-tertiary)' }}
                />
                Encrypting
              </span>
            )}
          </div>
          {/* Intentionally dark terminal-style box for ciphertext — theme-independent */}
          <div className="w-full min-h-[80px] bg-slate-900 rounded-xl px-4 py-3 font-mono text-xs text-emerald-400 break-all leading-relaxed">
            {ciphertext || (input ? '...' : 'Start typing above to see live encryption')}
          </div>
        </div>

        <div
          className="rounded-xl px-4 py-3 mb-8"
          style={{
            backgroundColor: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border)'
          }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Every record is encrypted with a unique key derived from your passphrase. Even if someone extracted your
            device storage, this is all they would see.
          </p>
        </div>

        <button
          onClick={() => navigate(PATHS.onboarding.chipIntro)}
          className="w-full py-3.5 rounded-xl font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Got it — meet Chip
        </button>
      </div>
    </div>
  );
}
