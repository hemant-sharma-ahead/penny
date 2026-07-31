import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

interface Props {
  size?: number;
}

export function ChipAvatar({ size = 40 }: Props) {
  const id = `chip-grad-${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#00C47D" />
          <Stop offset="100%" stopColor="#007A4D" />
        </LinearGradient>
      </Defs>
      {/* Rounded square background */}
      <Rect width="40" height="40" rx="12" fill={`url(#${id})`} />
      {/* Central sparkle */}
      <Path d="M20 10 L21.5 17.5 L29 19 L21.5 20.5 L20 28 L18.5 20.5 L11 19 L18.5 17.5 Z" fill="white" opacity={0.95} />
      {/* Small accent sparkles */}
      <Circle cx="28" cy="11" r="1.5" fill="white" opacity={0.6} />
      <Circle cx="12" cy="28" r="1" fill="white" opacity={0.5} />
      {/* Circuit dot hints */}
      <Circle cx="10" cy="14" r="1" fill="white" opacity={0.35} />
      <Circle cx="30" cy="26" r="1" fill="white" opacity={0.35} />
    </Svg>
  );
}
