/**
 * Transparent stand-in for the real `react-native` package, swapped in for every `import ... from
 * 'react-native'` in `apps/mobile/src` by `metro.config.js`'s custom `resolveRequest` — no source file
 * anywhere needs to import from here directly, and none should.
 *
 * The only override: `Text`. Real RN 0.86's `Text` is a plain functional component with no
 * `defaultProps`/`render` seam to monkey-patch (the classic pre-0.65 RN trick for exactly this kind of
 * app-wide override doesn't exist here — confirmed by reading RN's own source), so intercepting every
 * render requires *some* wrapper component. Rather than hand-migrate (or codemod) every call site to
 * import a differently-named component, this makes the override transparent at the module-resolution
 * level instead — every existing and future `import { Text } from 'react-native'` keeps working
 * unmodified, and automatically gets the scaled version. See `~/components/AppText.tsx` and
 * `~/theme/fontScale.ts` for what the override actually does and why (font-scale settings applying
 * app-wide).
 *
 * Implemented as a `Proxy`, not `export * from 'react-native'` (the original approach) — found via a
 * real on-device bug (a warning banner appearing on every app launch, right at startup): Metro/Babel's
 * CommonJS interop for `export *` eagerly reads every named export off the real `react-native` module
 * during this shim's own module evaluation, which includes RN's own deprecated re-exports
 * (`ProgressBarAndroid`/`SafeAreaView`/`Clipboard`/`InteractionManager`/`PushNotificationIOS`) — each of
 * those warns via `console.warn` the moment it's *read*, regardless of whether anything in the app
 * actually imports it.
 *
 * A bare `get` trap alone turned out not to be enough — the warnings persisted even after switching to a
 * Proxy, traced (via the actual browser-console stack trace, not guessed) to Metro's own dev-mode Fast
 * Refresh instrumentation: `registerExportsForReactRefresh` (called on every module load in development,
 * unconditionally, to detect which exports are React components for hot-reload boundaries) enumerates
 * *every* key on a required module's exports and reads each one — including these 5 — regardless of what
 * the importing file actually destructures. Since nothing in this codebase imports any of these 5 names
 * directly (confirmed via `grep`), the fix is an `ownKeys`/`getOwnPropertyDescriptor` trap pair that hides
 * exactly those 5 from enumeration (`for...in`/`Object.keys`/Fast Refresh's scan all use the same
 * `[[OwnPropertyKeys]]` internal step), while the plain `get` trap still forwards *direct* named access
 * transparently — so a real `import { Clipboard } from 'react-native'`, if one were ever added, would
 * still resolve correctly and still warn exactly the way real RN intends for actual usage; only
 * incidental enumeration is suppressed.
 */
import { Text as AppText } from '~/components/AppText';

// Plain `require`, not `import * as RealReactNative from 'react-native'` — real-device crash,
// 2026-08-29: real RN's own `index.js` exports several properties (including `StyleSheet`) as lazy
// getters (`get StyleSheet() { return require('./Libraries/StyleSheet/StyleSheet').default; }`), not
// plain values. Babel's ESM interop for a `import *` namespace binding against a CommonJS module
// copies/redefines those properties onto a fresh object during this shim's own module evaluation —
// which only reproduced as a hard native-level crash (`TypeError: Cannot read property 'create' of
// undefined`, escalating to a fatal `std::terminate()`) in a real release build (Hermes bytecode
// compilation), never in a debug/Metro-interpreted session, isolating it to exactly this interop step's
// evaluation-order sensitivity. A plain `require('react-native')` returns the real module's own
// `module.exports` object directly — no interop copy, no risk of evaluating a lazy getter at the wrong
// moment — so the Proxy below always forwards straight through to RN's own live getters instead.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate, see comment above
const RealReactNative = require('react-native') as typeof import('react-native');

// RN's own deprecated re-exports — each warns via `console.warn` on read alone, so they must be hidden
// from enumeration (Fast Refresh's module scan) without blocking direct access (see doc comment above).
const HIDDEN_FROM_ENUMERATION = new Set([
  'ProgressBarAndroid',
  'SafeAreaView',
  'Clipboard',
  'InteractionManager',
  'PushNotificationIOS'
]);

module.exports = new Proxy(RealReactNative as unknown as Record<string, unknown>, {
  get(target, prop, receiver) {
    if (prop === 'Text') return AppText;
    return Reflect.get(target, prop, receiver);
  },
  ownKeys(target) {
    return Reflect.ownKeys(target).filter((key) => typeof key !== 'string' || !HIDDEN_FROM_ENUMERATION.has(key));
  },
  getOwnPropertyDescriptor(target, prop) {
    if (typeof prop === 'string' && HIDDEN_FROM_ENUMERATION.has(prop)) return undefined;
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});
