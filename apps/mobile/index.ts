// Must run before anything else imports @penny/core's crypto engine. Metro resolves this to
// installCrypto.native.ts (polyfills global.crypto.subtle) or installCrypto.web.ts (no-op, the browser
// already has crypto.subtle) per platform — see docs/plans/mobile-migration.md Track 2.
import './src/polyfills/installCrypto';

import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import { registerSmsHeadlessTask } from './src/lib/smsHeadlessTask';

// SMS-Based Expense Auto-Tracking's live-capture path (docs/plans/sms-transaction-tracking.md §2) —
// MUST be registered here, at bundle load, not inside a component: a Headless JS task can spin up in
// a background React instance that never renders `App` at all. Gated to Android specifically —
// `AppRegistry.registerHeadlessTask` is a real RN API on native (iOS included, even though nothing
// ever starts this particular task there), but `react-native-web`'s `AppRegistry` shim doesn't
// implement it at all (genuinely `undefined`, not a no-op) — calling it unconditionally crashes the
// RN Web target at bundle load. Found via real `pnpm web` console output, not assumed — the prior
// "safe to call on every platform" comment here was wrong and never actually verified against web.
if (Platform.OS === 'android') {
  registerSmsHeadlessTask();
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
