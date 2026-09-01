import { useSettingsOptional, FONT_SCALE_MAP } from '~/context/SettingsContext';

/**
 * RN counterpart of web's `--font-scale` CSS variable. Web's mechanism is a single line in
 * `apps/web-react/src/index.css`: `html { font-size: calc(16px * var(--font-scale, 1)); }` — every
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
 * **2026-07-26: fixed for real, app-wide, via `~/components/AppText.tsx`.** RN's `Text` (0.86) is a
 * plain functional component with no `defaultProps`/`render` seam to monkey-patch app-wide (the classic
 * pre-0.65 RN trick doesn't apply here), so some wrapper component is unavoidable — but making every
 * call site *use* it didn't require touching call sites at all. `AppText` registers itself with
 * NativeWind's own `cssInterop` (its public API for wrapping non-core components — the same mechanism
 * that makes `className` work on real `Text` at all), so `className="text-sm"` etc. still resolves
 * exactly as before; `AppText` just reads the resolved `fontSize`/`lineHeight` back out of that and
 * multiplies both by this hook's value before handing off to the real `Text`. Getting every file to use
 * it is `metro.config.js`'s job, not any individual file's: a custom `resolveRequest` transparently
 * redirects every `import { Text } from 'react-native'` written in app source to
 * `~/lib/reactNativeShim.ts` (which re-exports everything from real `react-native` except `Text`) — a
 * first attempt at this used a one-time codemod to physically rewrite the import in all 189 files that
 * had it, which worked but wasn't the right shape of fix (every file carried a slightly different import
 * than it would naturally have, and it wasn't self-enforcing — a new file written the normal way would
 * silently opt back out with no warning). The Metro-alias version has zero per-file footprint, applies
 * automatically to files that don't exist yet, and can't be silently bypassed by habit. Verified by
 * `tsc -b` + `eslint` + an on-device pixel check (toggling Settings' text-size picker between S/A/A+/A++
 * and confirming real layout reflow, not just no crash). See the plan doc's progress log for the full
 * investigation, including why the codemod version was reverted.
 *
 * This hook itself remains the escape hatch for anything that needs the raw multiplier directly (rare —
 * `AppText` is the normal path now).
 *
 * **Uses `useSettingsOptional()`, not `useSettings()`** (2026-09-01 real-device crash fix) — every
 * `<Text>` in the app is silently `AppText` (see this hook's own file-level doc comment above), including
 * `ToastProvider`'s own toast card, which `App.tsx` deliberately renders outside `SettingsProvider`'s
 * subtree (see `useSettingsOptional`'s own doc comment for the full provider-order explanation). Falls
 * back to the unscaled default (`1`) rather than crashing when rendered there — font scale is a cosmetic
 * preference, not something worth taking down the whole app over.
 */
export function useFontScale(): number {
  const settings = useSettingsOptional();
  return FONT_SCALE_MAP[settings?.fontScale ?? 'default'];
}
