const { withAppBuildGradle } = require('expo/config-plugins');

// Produces one APK per CPU architecture instead of one "fat" APK containing all four —
// most of an APK's native-library weight is duplicated per-ABI, so a real device only
// ever needs the one matching its own CPU. Purely a packaging change (no code/behavior
// difference); each per-ABI APK still runs the exact same app. `reactNativeArchitectures`
// in gradle.properties controls which ABIs get *compiled* — this controls how the compiled
// output gets *packaged*. A plain `expo prebuild` regenerates android/app/build.gradle from
// scratch, so this has to be injected via a config plugin to survive that, rather than
// hand-edited directly into the generated file.
const ABI_SPLITS_BLOCK = `
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withAbiSplits only supports Groovy android/app/build.gradle files');
    }
    if (!config.modResults.contents.includes('splits {')) {
      config.modResults.contents = config.modResults.contents.replace(
        /android\s*\{/,
        (match) => `${match}\n${ABI_SPLITS_BLOCK}`
      );
    }
    return config;
  });
};
