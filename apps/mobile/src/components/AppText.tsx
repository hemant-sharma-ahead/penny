import { useMemo } from 'react';
import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { cssInterop } from 'nativewind';
import { useFontScale } from '~/theme/fontScale';

/**
 * App-wide replacement for RN's own `Text`, closing the font-scale gap `~/theme/fontScale.ts` documents
 * in detail (its own comment is the canonical writeup — read that before touching this file). Short
 * version: web's `--font-scale` CSS variable works for free because every `rem`-based Tailwind class
 * cascades from the root element; RN's `Text` has no such mechanism, and NativeWind statically resolves
 * plain utility classes like `text-lg` to a fixed pixel number at build time, so a `rem.set(...)` runtime
 * update (confirmed by direct pixel measurement) doesn't reach them.
 *
 * There is no way to intercept this without SOME wrapper component — RN 0.86's `Text` is a plain
 * functional component with no `defaultProps`/`render` seam left to monkey-patch (the classic pre-0.65
 * RN trick). But no call site needs to know this component exists, and none should import it directly:
 * `metro.config.js` transparently redirects every `import { Text } from 'react-native'` written in our
 * own app source to `~/lib/reactNativeShim.ts`, which re-exports everything from real `react-native`
 * except `Text` (this component). So the override is a property of the build, not something any current
 * or future file has to opt into — no codemod, no per-file import to remember.
 *
 * `cssInterop` (NativeWind's own public API for wrapping non-core components) maps this component's
 * `className` prop to a resolved `style` prop, computed with the exact same runtime NativeWind uses for
 * real `Text` — so every existing `className="text-sm"` etc. call site keeps working unmodified. The
 * only new behavior: once NativeWind resolves `style`, this reads `fontSize`/`lineHeight` back out and
 * multiplies both by the current font-scale factor before handing off to the real `Text`.
 */
function AppTextImpl({ style, ...rest }: TextProps) {
  const scale = useFontScale();

  const scaledStyle = useMemo(() => {
    if (scale === 1) return style;
    const flat = StyleSheet.flatten(style) ?? {};
    const override: { fontSize?: number; lineHeight?: number } = {};
    if (typeof flat.fontSize === 'number') override.fontSize = flat.fontSize * scale;
    if (typeof flat.lineHeight === 'number') override.lineHeight = flat.lineHeight * scale;
    return [style, override];
  }, [style, scale]);

  return <RNText style={scaledStyle} {...rest} />;
}

cssInterop(AppTextImpl, { className: 'style' });

export { AppTextImpl as Text };
