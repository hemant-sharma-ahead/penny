import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

interface Props {
  size?: number;
}

/**
 * Chip's tab icon — the gold coin + sprout medallion on its own (no horizon, no background
 * tile), matching "Ref 2, gold-styled" from docs/mockups/proposals/app-icon-v8.html. The
 * full "Golden Dawn" app-icon composition (assets/icon-source.svg) reads as a busy square
 * tile at tab-bar scale sitting among plain glyph icons — the bare medallion floats like the
 * rest of the tab icons instead.
 */
export function ChipAvatar({ size = 40 }: Props) {
  const id = `chip-${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <RadialGradient id={`gold-${id}`} cx="35%" cy="26%" r="80%">
          <Stop offset="0%" stopColor="#ffefc2" />
          <Stop offset="30%" stopColor="#f6c74b" />
          <Stop offset="62%" stopColor="#d89b2b" />
          <Stop offset="100%" stopColor="#8a5a12" />
        </RadialGradient>
      </Defs>
      <Circle cx="256" cy="256" r="200" fill={`url(#gold-${id})`} />
      <Circle cx="256" cy="256" r="190" fill="none" stroke="rgba(74,42,6,0.5)" strokeWidth="11" strokeDasharray="3 8" />
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
    </Svg>
  );
}
