module.exports = function (api) {
  api.cache(true);
  return {
    // `worklets: false` disables babel-preset-expo's own auto-detection of react-native-worklets
    // (which calls its internal resolveModule() using a bare 'react-native-worklets/plugin' specifier
    // resolved from babel-preset-expo's own package location, not ours). That auto-detection works fine
    // for a normal transform, but Metro's release-only "packed map" step (Hermes bytecode sourcemap
    // composition) re-evaluates this whole babel config — presets included — in a different context
    // where that bare-specifier resolution fails under pnpm's strict, symlinked node_modules layout
    // (found via the 2026-08-04 release-APK build failure: TypeError reading 'transformFile' in
    // metro-config's packedMap.js, root-caused to this MODULE_NOT_FOUND underneath it). Adding the
    // plugin ourselves via `require.resolve`, resolved eagerly from this file's own location, sidesteps
    // it entirely.
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind', worklets: false }], 'nativewind/babel'],
    plugins: [require.resolve('react-native-worklets/plugin')]
  };
};
