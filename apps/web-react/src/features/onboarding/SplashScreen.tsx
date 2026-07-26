import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { PennyLogo } from '@/components/ui/PennyLogo';

export function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(PATHS.onboarding.privacyPromise);
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-3 px-6">
      <div className="mb-6 drop-shadow-lg">
        <PennyLogo size={80} />
      </div>
      <h1 className="text-4xl font-semibold text-primary mb-2 tracking-tight">Penny</h1>
      <p className="text-tertiary text-base text-center">Chip in. Watch it grow.</p>
      <div className="mt-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
          <i className="ti ti-shield-check" style={{ fontSize: 14 }} aria-hidden="true" />
          Safe mode active
        </span>
      </div>
    </div>
  );
}
