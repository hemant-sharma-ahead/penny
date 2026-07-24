import { View, Text } from 'react-native';
import { useSettings, type ModuleVisibility } from '~/context/SettingsContext';
import { Card, IconBadge } from '~/components/ui';

// Home tools now = News + Calculators only. Insurance & Loans → money stat card; Cash Flow → Safe-to-spend;
// Health → folded into Home (advisor); Tax → a line in the money stat card.
const TOOL_TILES: { label: string; icon: string; color: string; moduleKey: keyof ModuleVisibility }[] = [
  { label: 'News', icon: 'ti-news', color: '#f59e0b', moduleKey: 'news' },
  { label: 'Calculators', icon: 'ti-math-function', color: '#f97316', moduleKey: 'calc' }
];

// web's `grid grid-cols-5` has no Yoga equivalent — swapped for `flex-row flex-wrap` with fixed-width
// (`w-[18%]`) children, same swap already used porting Insurance/Loans/Goals' grid-cols-2/3 layouts.
// No real nav stack yet, so tiles are inert until News/Calculators are ported + wired.
export function ToolsGrid() {
  const { modules } = useSettings();

  return (
    <View>
      <Text className="text-xs font-medium mb-2 text-tertiary">Tools</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {TOOL_TILES.filter((m) => modules[m.moduleKey]).map((m) => (
          <View key={m.label} className="w-[18%]">
            <Card onPress={() => {}} padding="xs" radius="md" className="items-center gap-1">
              <IconBadge icon={m.icon} color={m.color} bg={`${m.color}22`} size="sm" />
              <Text className="text-[9px] font-medium text-secondary text-center leading-tight">{m.label}</Text>
            </Card>
          </View>
        ))}
      </View>
    </View>
  );
}
