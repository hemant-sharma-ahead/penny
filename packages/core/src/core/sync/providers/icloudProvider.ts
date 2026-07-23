// iCloud backup/sync provider (Model B — the user's OWN iCloud). CODE-COMPLETE BUT DORMANT: iCloud
// is only reachable from the native (Capacitor) shell, so isAvailable() is false on the web PWA and
// this never runs today. When the native bring-up track lands, implement `nativeBridge` (Capacitor
// Filesystem against the iCloud-synced container) and iCloud lights up as a drop-in provider —
// no changes to the engine, UI, or interface.
import type { CloudProvider } from './types';
import { NeedsConsentError } from './types';
import { isApple } from '@/core/platform';

/** The thin native surface iCloud needs. Provided by the Capacitor layer in the native build; on the
 *  web it's absent, so every method is unreachable (guarded by isAvailable()). */
export interface ICloudNativeBridge {
  readTag(): Promise<string | null>;
  read(): Promise<{ text: string; tag: string } | null>;
  write(text: string): Promise<{ tag: string }>;
}

// Populated by the native shell at startup (e.g. window.__pennyICloud). Undefined on web.
function bridge(): ICloudNativeBridge | undefined {
  return (globalThis as { __pennyICloud?: ICloudNativeBridge }).__pennyICloud;
}

export const icloudProvider: CloudProvider = {
  id: 'icloud',
  label: 'iCloud',

  // iCloud is available only on Apple native platforms with the bridge present — false on web today.
  isAvailable(): boolean {
    return isApple() && bridge() !== undefined;
  },

  async ensureConnected(): Promise<'ok' | 'needs_consent' | 'unavailable'> {
    // iCloud auth is the device's Apple ID (no app-level consent flow). Available ⇒ connected.
    return icloudProvider.isAvailable() ? 'ok' : 'unavailable';
  },

  async remoteTag(): Promise<string | null> {
    const b = bridge();
    if (!b) throw new NeedsConsentError('icloud');
    return b.readTag();
  },

  async pull(): Promise<{ text: string; tag: string } | null> {
    const b = bridge();
    if (!b) throw new NeedsConsentError('icloud');
    return b.read();
  },

  async push(blob: Blob): Promise<{ tag: string }> {
    const b = bridge();
    if (!b) throw new NeedsConsentError('icloud');
    return b.write(await blob.text());
  }
};
