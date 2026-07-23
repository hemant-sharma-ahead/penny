import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

interface FormFieldProps {
  label: string;
  required?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}

export function FormField({ label, required, hint, error, children }: FormFieldProps) {
  const theme = useThemeColors();
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium text-secondary">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>
      {children}
      {hint && !error && <Text className="text-xs text-tertiary">{hint}</Text>}
      {/* Web uses --color-open (privacy-mode red) here specifically; privacy-mode tokens aren't ported
          to packages/core/src/theme/tokens.ts yet, so this substitutes theme.danger (same visual intent). */}
      {error && (
        <Text className="text-xs" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}
