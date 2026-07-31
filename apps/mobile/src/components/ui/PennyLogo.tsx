import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useThemeColors } from '~/theme/useThemeColors';

interface Props {
  size?: number;
}

export function PennyLogo({ size = 32 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Outer ring */}
      <Circle cx="16" cy="16" r="15" stroke="#00A86B" strokeWidth="2" fill="none" />
      {/* Inner ring */}
      <Circle cx="16" cy="16" r="11" stroke="#00A86B" strokeWidth="1.5" fill="none" opacity={0.4} />
      {/* Growth sprout — stem */}
      <Path d="M16 22V14" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" />
      {/* Left leaf */}
      <Path d="M16 17 C14 16 11 14 12 11 C13 8 16 10 16 14" fill="#00A86B" opacity={0.85} />
      {/* Right leaf */}
      <Path d="M16 15 C18 14 21 12 20 9 C19 6 16 8 16 12" fill="#00A86B" />
    </Svg>
  );
}

interface WordmarkProps {
  height?: number;
}

export function PennyWordmark({ height = 28 }: WordmarkProps) {
  const theme = useThemeColors();
  const ratio = 120 / 32;
  const width = height * ratio;
  return (
    <Svg width={width} height={height} viewBox="0 0 120 32" fill="none">
      {/* Coin mark */}
      <Circle cx="16" cy="16" r="15" stroke="#00A86B" strokeWidth="2" fill="none" />
      <Circle cx="16" cy="16" r="11" stroke="#00A86B" strokeWidth="1.5" fill="none" opacity={0.4} />
      <Path d="M16 22V14" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" />
      <Path d="M16 17 C14 16 11 14 12 11 C13 8 16 10 16 14" fill="#00A86B" opacity={0.85} />
      <Path d="M16 15 C18 14 21 12 20 9 C19 6 16 8 16 12" fill="#00A86B" />
      {/* "Penny" text */}
      <SvgText
        x="38"
        y="22"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="600"
        fontSize="18"
        fill={theme.textPrimary}
        letterSpacing="-0.3"
      >
        Penny
      </SvgText>
    </Svg>
  );
}
