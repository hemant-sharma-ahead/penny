import { View, Text, Pressable, ScrollView } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Optional Tabler icon class, e.g. 'ti-chart-bar' */
  icon?: string;
  /** Badge count shown as a small pill on the tab */
  count?: number;
}

interface TabStripProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Allow the strip to scroll horizontally when there are many tabs */
  scrollable?: boolean;
}

export function TabStrip<T extends string>({ options, value, onChange, scrollable = false }: TabStripProps<T>) {
  const theme = useThemeColors();
  const row = (
    <View className="flex-row border-b border-theme">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className="flex-row items-center gap-1.5 px-4 py-2.5 border-b-2"
            style={{ borderColor: active ? theme.primary : 'transparent' }}
          >
            {opt.icon && <Icon name={opt.icon} size={15} color={active ? theme.primary : theme.textTertiary} />}
            <Text className="text-sm font-medium" style={{ color: active ? theme.primary : theme.textTertiary }}>
              {opt.label}
            </Text>
            {opt.count !== undefined && opt.count > 0 && (
              <View
                className="rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: active ? theme.primary : theme.surfaceTertiary }}
              >
                <Text
                  className="text-xs font-semibold leading-none"
                  style={{ color: active ? '#fff' : theme.textSecondary }}
                >
                  {opt.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return row;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {row}
    </ScrollView>
  );
}
