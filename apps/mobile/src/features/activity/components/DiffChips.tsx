import { View, Text } from 'react-native';
import { prettifyField } from '../activityMeta';

interface Props {
  diff: string; // JSON { field: [before, after] }
  masked: boolean;
}

function fmt(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

/** RN port of apps/web-react/src/features/activity/components/DiffChips.tsx — renders an UPDATE diff
 *  as friendly before→after chips. Values hidden when masked. */
export function DiffChips({ diff, masked }: Props) {
  let parsed: Record<string, [unknown, unknown]>;
  try {
    parsed = JSON.parse(diff) as Record<string, [unknown, unknown]>;
  } catch {
    return null;
  }
  const fields = Object.keys(parsed);
  if (fields.length === 0) return null;

  if (masked) {
    return <Text className="text-[11px] text-tertiary mt-0.5">Changed: {fields.map(prettifyField).join(', ')}</Text>;
  }

  return (
    <View className="flex-row flex-wrap gap-1 mt-1">
      {fields.map((f) => {
        const [before, after] = parsed[f] ?? [undefined, undefined];
        const isId = /Id$/.test(f);
        return (
          <View key={f} className="flex-row items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-2">
            <Text className="text-[10px] font-medium text-secondary">{prettifyField(f)}</Text>
            {!isId && (
              <Text className="text-[10px] text-tertiary">
                {fmt(before)} → {fmt(after)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
