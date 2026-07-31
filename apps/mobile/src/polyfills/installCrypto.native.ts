import { install } from 'react-native-quick-crypto';

// Polyfills global.crypto.subtle to the Web Crypto API shape @penny/core's crypto engine already codes
// against — see index.ts and docs/plans/mobile-migration.md Track 2.
install();
