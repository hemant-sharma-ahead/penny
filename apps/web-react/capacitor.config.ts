import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.penny.app',
  appName: 'Penny',
  // Relative to this file's own location (apps/web-react/), matching where
  // apps/web-react/vite.config.ts actually outputs its build — this file used to live at
  // the repo root with `webDir: 'dist'`, which silently broke after the monorepo
  // restructuring moved the build output to apps/web-react/dist (fixed mid-2026 by
  // pointing at the new absolute-from-root path; now fixed properly by moving the config
  // itself to live next to the build it wraps).
  webDir: 'dist',
  // Penny is local-first and fully self-contained in the bundle; no remote server URL.
  android: {
    // Allow the WebView to use IndexedDB / Web Crypto without quirks.
    allowMixedContent: false
  }
};

export default config;
