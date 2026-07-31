import { useNavigate } from 'react-router-dom';
import { useSettings, type ModuleVisibility } from '@/context/SettingsContext';
import { PATHS } from '@/router/paths';
import { Card, IconBadge } from '@/components/ui';

// Home tools now = News + Calculators only. Insurance & Loans → money stat card; Cash Flow → Safe-to-spend;
// Health → folded into Home (advisor); Tax → a line in the money stat card.
const TOOL_TILES: { label: string; icon: string; path: string; color: string; moduleKey: keyof ModuleVisibility }[] = [
  { label: 'News', icon: 'ti-news', path: PATHS.app.news, color: '#f59e0b', moduleKey: 'news' },
  { label: 'Calculators', icon: 'ti-math-function', path: PATHS.app.calculators, color: '#f97316', moduleKey: 'calc' }
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
