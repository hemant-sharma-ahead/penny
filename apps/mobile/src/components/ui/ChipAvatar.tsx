import { Image } from 'react-native';
import chipIconSource from '../../../assets/chip-icon.png';

interface Props {
  size?: number;
}

/**
 * Chip's tab icon + avatar — the cocoa coin + sprout medallion (2026-08-21 rebrand). Was a
 * hand-drawn `react-native-svg` "Golden Dawn" mark; replaced with the real, final bundled
 * artwork (`assets/chip-icon.png`) supplied for the rebrand. See `PennyLogo.tsx` for the
 * matching app-logo swap — both moved from hand-coded SVG to a bundled raster asset for the
 * same reason (a finished design to render exactly, not re-interpret as vector shapes).
 */
export function ChipAvatar({ size = 40 }: Props) {
  return <Image source={chipIconSource} style={{ width: size, height: size }} resizeMode="contain" />;
}
