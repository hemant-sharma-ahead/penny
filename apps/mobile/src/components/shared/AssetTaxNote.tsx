import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { ASSET_TAX_INFO, type AssetTaxTopic } from '@/core/tax/assetTaxInfo';

/**
 * A compact, collapsible "Tax on this" note for an asset class — contextual tax awareness shown
 * where the asset is tracked (Portfolio sub-tabs). Sourced from the shared `assetTaxInfo` module.
 */
export function AssetTaxNote({ topic }: { topic: AssetTaxTopic }) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);
  const info = ASSET_TAX_INFO[topic];
  const color = theme.info;
  const inkColor = ink(color, theme.textPrimary);

  return (
    <View className="rounded-xl border" style={{ backgroundColor: tint(color, 10), borderColor: tint(color, 25) }}>
      <Pressable onPress={() => setOpen((v) => !v)} className="w-full flex-row items-center gap-2 p-2.5">
        <Icon name="ti-receipt-tax" size={16} color={color} />
        <Text className="text-xs font-semibold flex-1" style={{ color: inkColor }}>
          {info.title}
        </Text>
        <Icon name={open ? 'ti-chevron-up' : 'ti-chevron-down'} size={16} color={color} />
      </Pressable>
      {open && (
        <View className="flex flex-col gap-1.5 px-3 pb-3 pt-0.5">
          {info.points.map((p) => (
            <View key={p} className="flex-row gap-2">
              <Icon name="ti-point-filled" size={11} color={color} />
              <Text className="text-[11px] leading-relaxed flex-1" style={{ color: inkColor }}>
                {p}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
