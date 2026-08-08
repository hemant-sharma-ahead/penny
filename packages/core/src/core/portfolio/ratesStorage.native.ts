// RN/native+web counterpart to ratesStorage.ts's async-key-value contract, backed by AsyncStorage
// (same store `apps/mobile/src/lib/storage.ts` wraps, duplicated here rather than imported since
// `packages/core` must not depend on `apps/mobile`). Shared by every Cloudflare-hosted, mostly-static
// rate table this app caches client-side (`epfInterestRates.ts`, `ppfInterestRates.ts`).
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}
