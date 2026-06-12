import { usePrivacy, type PrivacyMode } from '@/context/PrivacyContext';

const config: Record<PrivacyMode, { label: string; dot: string; bg: string; text: string }> = {
  safe: { label: 'Safe', dot: '🟡', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  privacy: { label: 'Private', dot: '🟣', bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700' },
  open: { label: 'Open', dot: '🟢', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' }
};

export function PrivacyBadge() {
  const { mode } = usePrivacy();
  const { label, dot, bg, text } = config[mode];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${bg} ${text}`}
    >
      <span aria-hidden="true">{dot}</span>
      {label}
    </span>
  );
}
