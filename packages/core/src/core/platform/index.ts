// Runtime platform detection. Today Penny runs as a web PWA (both false); when the Capacitor
// native shell lands, these light up native-only capabilities such as the iCloud backup provider.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside the Capacitor native wrapper (false on the web PWA). */
export function isNative(): boolean {
  return capacitor()?.isNativePlatform?.() ?? false;
}

/** True on Apple native platforms (iOS/iPadOS) — where iCloud backup is available. */
export function isApple(): boolean {
  return isNative() && capacitor()?.getPlatform?.() === 'ios';
}
