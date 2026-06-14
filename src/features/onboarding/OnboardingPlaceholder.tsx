import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  subtitle: string;
  nextPath: string;
  nextLabel?: string;
}

export function OnboardingPlaceholder({ title, subtitle, nextPath, nextLabel = 'Continue' }: Props) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm text-center">
        <h2 className="text-2xl font-semibold text-primary mb-3">{title}</h2>
        <p className="text-secondary text-sm mb-10">{subtitle}</p>
        <div className="rounded-xl bg-surface-2 border border-theme p-6 mb-8 text-tertiary text-sm">
          Screen coming soon — M4
        </div>
        <button
          onClick={() => navigate(nextPath)}
          className="w-full py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
