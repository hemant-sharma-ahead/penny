import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText
} from 'react-native-svg';
import { useThemeColors } from '~/theme/useThemeColors';

interface Props {
  size?: number;
}

/**
 * Penny's mark — "Golden Dawn" (see assets/icon-source.svg and
 * docs/mockups/proposals/app-icon-v8.html, option 6): a gold coin cresting a dawn horizon,
 * struck with the original web-react sprout mark. Same composition as the app icon and
 * ChipAvatar — this is the one place it's shown at logo scale rather than icon scale (the
 * onboarding Splash screen, and the component gallery).
 */
export function PennyLogo({ size = 32 }: Props) {
  const id = `logo-${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <ClipPath id={`clip-${id}`}>
          <Rect width="512" height="512" rx="112" />
        </ClipPath>
        <LinearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#08281f" />
          <Stop offset="55%" stopColor="#0d6b4a" />
          <Stop offset="85%" stopColor="#e79a3f" />
          <Stop offset="100%" stopColor="#fbcb6b" />
        </LinearGradient>
        <RadialGradient id={`gold-${id}`} cx="35%" cy="26%" r="80%">
          <Stop offset="0%" stopColor="#ffefc2" />
          <Stop offset="30%" stopColor="#f6c74b" />
          <Stop offset="62%" stopColor="#d89b2b" />
          <Stop offset="100%" stopColor="#8a5a12" />
        </RadialGradient>
      </Defs>
      <G clipPath={`url(#clip-${id})`}>
        <Rect width="512" height="512" fill={`url(#sky-${id})`} />
        <G transform="translate(0,44)">
          <Circle cx="256" cy="256" r="200" fill={`url(#gold-${id})`} />
          <Circle
            cx="256"
            cy="256"
            r="190"
            fill="none"
            stroke="rgba(74,42,6,0.5)"
            strokeWidth="11"
            strokeDasharray="3 8"
          />
          <Circle cx="256" cy="256" r="172" fill="none" stroke="rgba(255,244,214,0.55)" strokeWidth="4" />
          <Path
            d="M120 196 A172 172 0 0 1 196 120"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="11"
            fill="none"
            strokeLinecap="round"
          />
          <Path d="M256 368V224" stroke="#6b430d" strokeWidth="26" strokeLinecap="round" />
          <Path d="M256 288 C216 272 168 240 184 176 C200 112 256 152 256 232" fill="#fff8ec" opacity={0.95} />
          <Path d="M256 256 C296 240 344 208 328 144 C312 80 256 120 256 200" fill="#fff8ec" />
        </G>
        <Path d="M0 372 Q256 328 512 372 L512 512 L0 512 Z" fill="#04241a" />
      </G>
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
  const id = `wordmark-${height}`;
  return (
    <Svg width={width} height={height} viewBox="0 0 120 32" fill="none">
      <Defs>
        <RadialGradient id={`gold-${id}`} cx="35%" cy="26%" r="80%">
          <Stop offset="0%" stopColor="#ffefc2" />
          <Stop offset="40%" stopColor="#f6c74b" />
          <Stop offset="100%" stopColor="#8a5a12" />
        </RadialGradient>
      </Defs>
      {/* Coin mark, simplified to wordmark scale */}
      <Circle cx="16" cy="16" r="15" fill={`url(#gold-${id})`} />
      <Path d="M16 22V14" stroke="#6b430d" strokeWidth="2" strokeLinecap="round" />
      <Path d="M16 17 C14 16 11 14 12 11 C13 8 16 10 16 14" fill="#fff8ec" opacity={0.95} />
      <Path d="M16 15 C18 14 21 12 20 9 C19 6 16 8 16 12" fill="#fff8ec" />
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
