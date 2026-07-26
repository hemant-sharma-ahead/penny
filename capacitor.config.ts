import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.penny.app',
  appName: 'Penny',
  // Points into apps/web-react's own build output, not a root-level dist/ — the monorepo
  // restructuring moved the web app's build there and this was never updated to match,
  // silently breaking `npx cap sync android` until this fix.
  webDir: 'apps/web-react/dist',
  // Penny is local-first and fully self-contained in the bundle; no remote server URL.
  android: {
    // Allow the WebView to use IndexedDB / Web Crypto without quirks.
    allowMixedContent: false
  }
};

export default config;
