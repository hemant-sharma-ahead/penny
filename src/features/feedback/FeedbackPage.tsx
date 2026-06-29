import { useState } from 'react';

// Placeholder — swap for real support inbox before release
const SUPPORT_EMAIL = 'feedback@penny.app';
const APP_VERSION = __APP_VERSION__;

type FeedbackType = 'bug' | 'suggestion' | 'question';

const TYPES: { id: FeedbackType; label: string; icon: string; subject: string }[] = [
  { id: 'bug', label: 'Bug report', icon: 'ti-bug', subject: 'Bug report — Penny' },
  { id: 'suggestion', label: 'Suggestion', icon: 'ti-bulb', subject: 'Suggestion — Penny' },
  { id: 'question', label: 'Question', icon: 'ti-help-circle', subject: 'Question — Penny' }
];

export function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [message, setMessage] = useState('');

  const selected = TYPES.find((t) => t.id === type) ?? TYPES[0];

  const handleSend = () => {
    const trimmed = message.trim();
    const bodyParts = trimmed ? [trimmed, '', '---', `Penny v${APP_VERSION}`] : ['---', `Penny v${APP_VERSION}`];
    const body = bodyParts.join('\n');
    const mailto =
      `mailto:${SUPPORT_EMAIL}` +
      `?subject=${encodeURIComponent(selected?.subject ?? '')}` +
      `&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
  };

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-5 max-w-[430px] mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-primary">Contact &amp; Feedback</h1>
        <p className="text-xs text-tertiary mt-1">We read every message. Your feedback shapes what gets built next.</p>
      </div>

      {/* Type selector */}
      <div>
        <p className="text-xs font-medium text-secondary mb-2">What's this about?</p>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const active = type === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: 'var(--color-primary)1a',
                        borderColor: 'var(--color-primary)',
                        color: 'var(--color-primary)'
                      }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                }
              >
                <i className={`ti ${t.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
                <span className="text-[10px] font-medium leading-tight text-center">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Message */}
      <div>
        <p className="text-xs font-medium text-secondary mb-2">Your message (optional)</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us more — what happened, what you expected, any ideas…"
          rows={5}
          className="w-full input-surface rounded-xl px-3 py-2.5 text-sm resize-none border"
          style={{ lineHeight: '1.5' }}
        />
        <p className="text-[10px] text-tertiary mt-1">
          Opens your mail app with a pre-filled draft. Nothing is sent automatically.
        </p>
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity active:opacity-80"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <i className="ti ti-send" style={{ fontSize: 18 }} aria-hidden="true" />
        Open mail app
      </button>

      {/* Divider */}
      <div className="border-t border-theme" />

      {/* Info rows */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-2 flex-shrink-0">
            <i className="ti ti-lock text-secondary" style={{ fontSize: 15 }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-primary">Privacy-first</p>
            <p className="text-[11px] text-tertiary mt-0.5">
              Only what you type is sent — no financial data, device fingerprint, or identifiers are ever attached
              automatically.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-2 flex-shrink-0">
            <i className="ti ti-mail text-secondary" style={{ fontSize: 15 }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-primary">Sending to</p>
            <p className="text-[11px] text-tertiary mt-0.5">{SUPPORT_EMAIL}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-2 flex-shrink-0">
            <i className="ti ti-device-mobile text-secondary" style={{ fontSize: 15 }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-primary">App version</p>
            <p className="text-[11px] text-tertiary mt-0.5">Penny v{APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
