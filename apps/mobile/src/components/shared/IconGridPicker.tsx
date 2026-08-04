import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { SearchInput } from '~/components/ui';
import { CATEGORY_ICON_GROUPS } from '@/core/expenses/categoryIcons';
import { useThemeColors } from '~/theme/useThemeColors';
// Metro bundles JSON directly — web fetched this ~600 KB index at runtime from `public/` (via
// `import.meta.env.BASE_URL`, no RN equivalent); here it's just part of the JS bundle, so no
// fetch/cache/loading-state machinery is needed at all.
import tablerIconIndex from './tablerIconIndex.json';

interface IconEntry {
  n: string; // icon name without the `ti-` prefix
  t: string[]; // search tags
}

const ALL_ICONS = tablerIconIndex as IconEntry[];

interface Props {
  /** Currently selected icon as a full `ti-*` class. */
  value: string;
  onChange: (icon: string) => void;
  color?: string;
}

const MAX_RESULTS = 60;

export function IconGridPicker({ value, onChange, color }: Props) {
  const theme = useThemeColors();
  const accentColor = color ?? theme.primary;
  const [query, setQuery] = useState('');

  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    const out: string[] = [];
    for (const entry of ALL_ICONS) {
      if (entry.n.includes(q) || entry.t.some((tag) => tag.includes(q))) {
        out.push(`ti-${entry.n}`);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [searching, query]);

  function renderIcon(icon: string) {
    const selected = icon === value;
    return (
      <Pressable
        key={icon}
        onPress={() => onChange(icon)}
        className="w-[15%] items-center justify-center p-2 rounded-xl border-2 bg-surface-2"
        style={{ borderColor: selected ? accentColor : 'transparent' }}
        accessibilityLabel={icon}
        accessibilityState={{ selected }}
      >
        <Icon name={icon} size={18} color={selected ? accentColor : theme.textSecondary} />
      </Pressable>
    );
  }

  return (
    <View className="gap-3">
      <SearchInput value={query} onChange={setQuery} placeholder="Search all icons…" />

      {/* Web caps this list at `max-h-48 overflow-y-auto` — this modal's body is already a
          scrollable `ScrollView` (see CategoryEditorModal), and RN doesn't handle a vertical
          ScrollView nested inside another vertical ScrollView well, so the grid just flows with
          the rest of the form instead of scrolling in its own clipped region. */}
      {searching ? (
        results.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">{results.map(renderIcon)}</View>
        ) : (
          <Text className="text-xs text-tertiary text-center py-4">No icons found</Text>
        )
      ) : (
        <View className="gap-3">
          {CATEGORY_ICON_GROUPS.map((group) => (
            <View key={group.label}>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1.5">
                {group.label}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">{group.icons.map(renderIcon)}</View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
