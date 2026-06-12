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
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        <h2 className="text-2xl font-semibold text-slate-900 mb-3">{title}</h2>
        <p className="text-slate-500 text-sm mb-10">{subtitle}</p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 mb-8 text-slate-400 text-sm">
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
