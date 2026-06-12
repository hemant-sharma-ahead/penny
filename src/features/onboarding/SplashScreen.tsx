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
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-lg"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <i className="ti ti-coin text-white" style={{ fontSize: 40 }} aria-hidden="true" />
      </div>
      <h1 className="text-4xl font-semibold text-slate-900 mb-2 tracking-tight">Penny</h1>
      <p className="text-slate-400 text-base text-center">Chip in. Watch it grow.</p>
      <div className="mt-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
          <i className="ti ti-shield-check" style={{ fontSize: 14 }} aria-hidden="true" />
          Safe mode active
        </span>
      </div>
    </div>
  );
}
