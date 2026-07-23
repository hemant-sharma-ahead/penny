// Must run before anything else imports @penny/core's crypto engine. Metro resolves this to
// installCrypto.native.ts (polyfills global.crypto.subtle) or installCrypto.web.ts (no-op, the browser
// already has crypto.subtle) per platform — see docs/plans/mobile-migration.md Track 2.
import './src/polyfills/installCrypto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
