import type { RefObject } from 'react';
import type { ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/** Captures the mounted `ShareCard` behind `ref` and opens the native share sheet with the resulting
 *  PNG. Silently no-ops if capture fails or sharing isn't available (e.g. simulator) — same "fall
 *  through, nothing else to do" behavior as web's try/catch around `navigator.share`. Split out of
 *  ShareCard.tsx (a component file) so this plain function doesn't break React Fast Refresh's
 *  "one file, only components" rule. */
export async function captureAndShareCard(ref: RefObject<ViewShotRef | null>, title: string): Promise<void> {
  try {
    const uri = await ref.current?.capture();
    if (!uri) return;
    const available = await Sharing.isAvailableAsync();
    if (!available) return;
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
  } catch {
    /* user cancelled or share failed — no download-to-Files fallback built (no equivalent need on RN;
       the native share sheet already offers "Save to Files/Photos" as one of its own options) */
  }
}
