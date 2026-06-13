import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { ChipAvatar } from '@/components/ui/ChipAvatar';

const mockInsights = [
  {
    icon: 'ti-trending-up',
    tag: 'Portfolio',
    text: 'Your SIP in Parag Parikh Flexi Cap has underperformed its benchmark by 2.3% over 12 months. Consider a review.'
  },
  {
    icon: 'ti-calendar-due',
    tag: 'Tax',
    text: '₹32,000 of your ₹1.5L 80C limit is still unused. You have 6 weeks before the deadline.'
  },
  {
    icon: 'ti-repeat',
    tag: 'Subscriptions',
    text: "You haven't used Hotstar in 47 days but ₹299 was charged last week. Cancel to save ₹3,588/year."
  }
];

export function ChipIntroScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-white px-6 py-10">
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 drop-shadow-lg w-fit">
            <ChipAvatar size={56} />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Meet Chip</h2>
          <p className="text-slate-500 text-sm">
            Your AI money coach. Context-aware, always shows its reasoning, and never shares your data.
          </p>
        </div>

        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Sample insights</p>
        <div className="flex flex-col gap-3 mb-8">
          {mockInsights.map((insight) => (
            <div key={insight.tag} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <i className={`ti ${insight.icon} text-white`} style={{ fontSize: 12 }} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-slate-500">{insight.tag}</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{insight.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-amber-800 leading-relaxed">
            Chip anonymises your data before any AI call. Amounts are banded, names are removed, and every call is
            logged in your Privacy Centre.
          </p>
        </div>

        <button
          onClick={() => navigate(PATHS.onboarding.simulatedDashboard)}
          className="w-full py-3.5 rounded-xl font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          See my dashboard
        </button>
      </div>
    </div>
  );
}
