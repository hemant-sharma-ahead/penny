import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: string;
}

interface EmptyStateProps {
  /** Tabler icon class, e.g. 'ti-inbox' */
  icon: string;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const theme = useThemeColors();
  return (
    <View className="items-center justify-center gap-3 py-10 px-6">
      <View
        className="w-14 h-14 rounded-2xl items-center justify-center"
        style={{ backgroundColor: `${theme.primary}1a` }}
      >
        <Icon name={icon} size={26} color={theme.primary} />
      </View>
      <View className="items-center gap-1">
        <Text className="text-sm font-semibold text-primary">{title}</Text>
        {description && <Text className="text-xs text-tertiary leading-relaxed text-center">{description}</Text>}
      </View>
      {action && (
        <Pressable
          onPress={action.onPress}
          className="flex-row items-center gap-1.5 px-4 py-2 rounded-xl"
          style={{ backgroundColor: theme.primary }}
        >
          {action.icon && <Icon name={action.icon} size={15} color="#fff" />}
          <Text className="text-sm font-semibold text-white">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
