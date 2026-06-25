import { useNavigate } from 'react-router-dom';

/** Top-left back affordance for onboarding screens. Navigates to the explicit previous step. */
export function OnboardingBack({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      aria-label="Go back"
      className="absolute top-5 left-5 z-10 w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
    >
      <i className="ti ti-arrow-left" style={{ fontSize: 20 }} aria-hidden="true" />
    </button>
  );
}
