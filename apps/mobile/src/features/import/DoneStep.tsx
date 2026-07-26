import { View, Text } from 'react-native';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';

interface DoneStepProps {
  importedCount: number;
  onDone: () => void;
}

/** RN port of apps/web-react/src/features/import/DoneStep.tsx. */
export function DoneStep({ importedCount, onDone }: DoneStepProps) {
  const theme = useThemeColors();

  return (
    <View className="flex-1 items-center justify-center gap-6 py-12">
      <View
        className="w-16 h-16 rounded-full items-center justify-center"
        style={{ backgroundColor: tint(theme.success) }}
      >
        <Icon name="ti-check" size={32} color={theme.success} />
      </View>
      <View className="items-center">
        <Text className="text-xl font-semibold text-primary">Import complete</Text>
        <Text className="text-sm text-secondary mt-1">
          {importedCount} expense{importedCount !== 1 ? 's' : ''} added to your vault
        </Text>
      </View>
      <Button variant="primary" fullWidth onPress={onDone}>
        Go to Expenses
      </Button>
    </View>
  );
}
