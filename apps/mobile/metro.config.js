const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Expo's default config deliberately omits 'web' from resolver.platforms (it ships with
// ['ios', 'android', 'tvos', 'macos'] — see @expo/metro-config's ExpoMetroConfig.js), even though
// Metro core's own default includes it. Without 'web' here, Metro's file crawler never recognizes
// `foo.web.ts` as a platform variant of `foo` at all — imports resolve straight to the bare `foo.ts`,
// silently skipping every `.web.ts` sibling in this codebase (entitlement.web.ts, apiBase.web.ts, etc.).
// `.native.ts` siblings aren't affected by this — Metro treats `.native.*` as a hardcoded fallback for
// every non-'web' platform regardless of this array — so this gap only ever surfaces on `expo start --web`.
config.resolver.platforms = [...config.resolver.platforms, 'web'];

// App-wide font-scale fix (2026-07-26, see ~/components/AppText.tsx and ~/theme/fontScale.ts for the
// full writeup): redirect every `import ... from 'react-native'` written in our own app source to
// `~/lib/reactNativeShim.ts` instead, which re-exports everything from the real `react-native` except
// `Text` (swapped for a font-scale-aware wrapper). This is the standard Metro alias recipe (Expo's own
// docs use the identical `context.resolveRequest(context, <replacement>, platform)` pattern to alias one
// npm package name to another) — the only difference here is aliasing to a local file. Two exclusions,
// both required to avoid infinite recursion: the shim's own `export * from 'react-native'` needs the
// *real* module, and `AppText.tsx` itself needs the real `Text` to wrap. `node_modules` is excluded
// entirely — libraries like React Navigation import `react-native` internally and must keep getting the
// unmodified real thing, not our shim.
const REACT_NATIVE_SHIM_PATH = path.resolve(__dirname, 'src/lib/reactNativeShim.ts');
const APP_TEXT_PATH = path.resolve(__dirname, 'src/components/AppText.tsx');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react-native' &&
    !context.originModulePath.includes('node_modules') &&
    context.originModulePath !== REACT_NATIVE_SHIM_PATH &&
    context.originModulePath !== APP_TEXT_PATH
  ) {
    return (defaultResolveRequest ?? context.resolveRequest)(context, REACT_NATIVE_SHIM_PATH, platform);
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
