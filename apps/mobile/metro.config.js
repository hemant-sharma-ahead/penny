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

module.exports = withNativeWind(config, { input: './global.css' });
