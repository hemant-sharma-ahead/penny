import { useSettings, FONT_SCALE_MAP } from '~/context/SettingsContext';

/**
 * RN counterpart of web's `--font-scale` CSS variable. Web's mechanism is a single line in
 * `apps/web-legacy/src/index.css`: `html { font-size: calc(16px * var(--font-scale, 1)); }` — every
 * `rem`-based Tailwind class cascades from the root element's font-size automatically, because that's
 * what the CSS `rem` unit means, enforced by the browser engine at every paint (never precomputed).
 *
 * A 2026-07-25 attempt to replicate this exactly (NativeWind/`react-native-css-interop` exposes a real
 * global `rem` observable — `rem.set(...)` — designed for exactly this kind of case) did NOT work in
 * practice, confirmed by direct measurement: a text element's rendered pixel height (via `uiautomator
 * dump`'s exact bounding box) was identical before/after changing font scale, both live and after a full
 * cold app restart with the new value already set before first render. Root cause: NativeWind's compiler
 * statically resolves plain utility classes with no other dynamic dependency (like `text-lg`, which
 * doesn't reference a CSS variable) into a fixed pixel number at build time — unlike theme colors, which
 * use `var(--color-x)` and can never be resolved ahead of time, so they're forced to stay
 * runtime-reactive. The `rem` observable exists but apparently isn't consulted for statically-resolvable
 * classes in this NativeWind version. No config flag to force universal runtime resolution was found.
 *
 * The only remaining path to real global font scaling is a dedicated `<AppText>` wrapper component
 * (reading this hook and multiplying its own `fontSize`) migrated across every screen using a semantic
 * text-size class — a real, substantial task (100+ files), scoped as its own follow-up, not attempted
 * here. `useFontScale()` below remains the opt-in per-component escape hatch in the meantime.
 */
export function useFontScale(): number {
  const { fontScale } = useSettings();
  return FONT_SCALE_MAP[fontScale];
}
