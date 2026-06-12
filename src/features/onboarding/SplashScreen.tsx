import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';

export function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(PATHS.onboarding.privacyPromise);
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <i className="ti ti-coin text-white" style={{ fontSize: 32 }} aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-semibold text-slate-900 mb-2">Penny</h1>
      <p className="text-slate-500 text-base text-center">Chip in. Watch it grow.</p>
      <div className="mt-12">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
          style={{
            backgroundColor: 'var(--color-safe-bg)',
            color: 'var(--color-safe)',
            borderColor: 'var(--color-safe)'
          }}
        >
          🟡 Safe mode active
        </span>
      </div>
    </div>
  );
}
