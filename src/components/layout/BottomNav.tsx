import { NavLink } from 'react-router-dom';
import { PATHS } from '@/router/paths';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  isFab?: boolean;
}

const navItems: NavItem[] = [
  { path: PATHS.app.home, label: 'Home', icon: 'ti-home' },
  { path: PATHS.app.portfolio, label: 'Portfolio', icon: 'ti-chart-pie' },
  { path: PATHS.app.chip, label: 'Chip', icon: 'ti-sparkles', isFab: true },
  { path: PATHS.app.expenses, label: 'Expenses', icon: 'ti-wallet' },
  { path: PATHS.app.goals, label: 'Goals', icon: 'ti-target' }
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
    >
      <ul className="flex items-end justify-around h-16 px-2 list-none m-0 p-0">
        {navItems.map((item) =>
          item.isFab ? (
            <li key={item.path} className="flex-1 flex justify-center">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center -translate-y-4
                   w-14 h-14 rounded-full shadow-lg transition-all
                   ${isActive ? 'bg-green-600 shadow-green-200' : 'bg-[#00a86b] shadow-slate-200'}`
                }
                aria-label={item.label}
              >
                <i className={`ti ${item.icon} text-white`} style={{ fontSize: 24 }} aria-hidden="true" />
              </NavLink>
            </li>
          ) : (
            <li key={item.path} className="flex-1">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 w-full transition-colors
                   ${isActive ? 'text-[#00a86b]' : 'text-slate-400 hover:text-slate-600'}`
                }
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
