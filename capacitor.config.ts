import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.penny.app',
  appName: 'Penny',
  webDir: 'dist',
  // Penny is local-first and fully self-contained in the bundle; no remote server URL.
  android: {
    // Allow the WebView to use IndexedDB / Web Crypto without quirks.
    allowMixedContent: false
  }
};

export default config;
