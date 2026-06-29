import { useNavigate } from 'react-router-dom';
import { useSettings, type ModuleVisibility } from '@/context/SettingsContext';
import { PATHS } from '@/router/paths';
import { Card, IconBadge } from '@/components/ui';

const TOOL_TILES: { label: string; icon: string; path: string; color: string; moduleKey: keyof ModuleVisibility }[] = [
  { label: 'Insurance', icon: 'ti-shield', path: PATHS.app.insurance, color: '#3b82f6', moduleKey: 'insurance' },
  { label: 'Loans', icon: 'ti-calculator', path: PATHS.app.loans, color: '#06b6d4', moduleKey: 'loans' },
  {
    label: 'Health Score',
    icon: 'ti-heart-rate-monitor',
    path: PATHS.app.health,
    color: '#ec4899',
    moduleKey: 'health'
  },
  { label: 'Tax', icon: 'ti-receipt-tax', path: PATHS.app.tax, color: '#8b5cf6', moduleKey: 'tax' },
  { label: 'Cash Flow', icon: 'ti-trending-down', path: PATHS.app.cashflow, color: '#14b8a6', moduleKey: 'cashflow' },
  { label: 'News', icon: 'ti-news', path: PATHS.app.news, color: '#f59e0b', moduleKey: 'news' }
];

export function ToolsGrid() {
  const { modules } = useSettings();
  const navigate = useNavigate();

  return (
    <div>
      <p className="text-xs font-medium mb-2 text-tertiary">Tools</p>
      <div className="grid grid-cols-5 gap-1.5">
        {TOOL_TILES.filter((m) => modules[m.moduleKey]).map((m) => (
          <Card
            key={m.label}
            onClick={() => navigate(m.path)}
            padding="xs"
            radius="md"
            className="flex flex-col items-center gap-1"
          >
            <IconBadge icon={m.icon} color={m.color} bg={`${m.color}22`} size="sm" />
            <span className="text-[9px] font-medium text-secondary text-center leading-tight">{m.label}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
