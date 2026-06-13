import { NavLink } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { ChipAvatar } from '@/components/ui/ChipAvatar';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  isFab?: boolean;
  color?: string;
}

const navItems: NavItem[] = [
  { path: PATHS.app.home, label: 'Home', icon: 'ti-home', color: '#00a86b' },
  { path: PATHS.app.portfolio, label: 'Portfolio', icon: 'ti-chart-pie', color: '#6366f1' },
  { path: PATHS.app.chip, label: 'Chip', icon: 'ti-sparkles', isFab: true },
  { path: PATHS.app.expenses, label: 'Expenses', icon: 'ti-wallet', color: '#f59e0b' },
  { path: PATHS.app.goals, label: 'Goals', icon: 'ti-target', color: '#10b981' }
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
    >
      <ul className="flex items-center justify-around h-16 px-2 list-none m-0 p-0">
        {navItems.map((item) =>
          item.isFab ? (
            <li key={item.path} className="flex-1 flex justify-center">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center
                   w-14 h-14 rounded-full shadow-lg transition-all
                   ${isActive ? 'bg-green-600 shadow-green-200' : 'bg-[#00a86b] shadow-slate-200'}`
                }
                aria-label={item.label}
              >
                <ChipAvatar size={30} />
              </NavLink>
            </li>
          ) : (
            <li key={item.path} className="flex-1">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 w-full transition-colors
                   ${isActive ? '' : 'text-slate-400 hover:text-slate-600'}`
                }
                style={({ isActive }) => (isActive && item.color ? { color: item.color } : undefined)}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: 22 }} aria-hidden="true" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </NavLink>
            </li>
          )
        )}
      </ul>
    </nav>
  );
}
