import type { ReactNode } from 'react';
import { View, Text } from 'react-native';

interface DetailRowProps {
  label: ReactNode;
  value: ReactNode;
  /** sm = text-xs (default), md = text-sm */
  size?: 'sm' | 'md';
  className?: string;
}

export function DetailRow({ label, value, size = 'sm', className = '' }: DetailRowProps) {
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <View className={`flex-row items-center justify-between gap-3 ${className}`}>
      <Text className={`${textSize} text-secondary`}>{label}</Text>
      <Text className={`${textSize} font-semibold text-primary text-right`}>{value}</Text>
    </View>
  );
}
