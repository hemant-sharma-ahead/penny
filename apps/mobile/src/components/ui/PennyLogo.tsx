import { Image, Text, View } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';
import pennyIconSource from '../../../assets/icon.png';

interface Props {
  size?: number;
}

/**
 * Penny's mark (2026-08-21 rebrand) — the real, final app-icon artwork (`assets/icon.png`), the
 * same file wired into `app.json`'s `icon`/adaptive-icon config and the Android splash/launcher
 * resources (see docs/ARCHITECTURE.md's icon-asset entry). Was a hand-drawn "Golden Dawn"
 * `react-native-svg` composition; replaced for the same reason as `ChipAvatar.tsx`'s swap — a
 * finished design to render exactly, not re-interpret as vector shapes. This is the one in-app
 * place it's shown at logo scale rather than icon scale (the onboarding Splash screen, and the
 * component gallery).
 */
export function PennyLogo({ size = 32 }: Props) {
  return <Image source={pennyIconSource} style={{ width: size, height: size }} resizeMode="contain" />;
}

interface WordmarkProps {
  height?: number;
}

/**
 * Coin mark + "Penny" text side by side. Was one unified `react-native-svg` canvas (vector coin
 * glyph + `SvgText`) — now a plain `View` row (icon `Image` + RN `Text`), since a raster asset
 * can't be composited as an `<Svg>` child the way the old hand-drawn glyph was. Same rebrand as
 * `PennyLogo`/`ChipAvatar` above.
 */
export function PennyWordmark({ height = 28 }: WordmarkProps) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center" style={{ height }}>
      <Image
        source={pennyIconSource}
        style={{ width: height, height, marginRight: height * 0.35 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: height * 0.64, fontWeight: '600', color: theme.textPrimary, letterSpacing: -0.3 }}>
        Penny
      </Text>
    </View>
  );
}
