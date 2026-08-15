/**
 * SMS capture seam (docs/plans/sms-transaction-tracking.md §2) — the real Android implementation,
 * backed by the local Expo Module `modules/expo-sms-capture/` (a genuine bespoke local module per the
 * plan's own reasoning — not a third-party package). See that module's Kotlin sources for the native
 * side: `ExpoSmsCaptureModule.kt` (permission + inbox-query + queue-drain surface), `SmsReceiver.kt` /
 * `SmsProcessingWorker.kt` / `SmsHeadlessTaskService.kt` (the live-capture `BroadcastReceiver` →
 * `WorkManager` → Headless JS path).
 *
 * The native module is loaded via a lazy dynamic `import()`, not a top-level `import`, specifically
 * so this file loading on iOS doesn't crash at import time. Metro's `.native.ts` platform-extension
 * resolution picks THIS file for iOS too (there's no `.ios.ts` override — SMS tracking is
 * Android-only per plan §2's platform-scope decision, and `SmsTrackingSettingsPage.tsx` — which
 * imports from `~/lib/smsCapture` — renders on every platform to show its own "not available here"
 * message), so an eager top-level `requireNativeModule` call would explode the whole iOS app at
 * startup: `expo-sms-capture`'s `expo-module.config.json` declares `platforms: ["android"]` only, so
 * the module is never even registered there. `assertAndroid()` below throws a friendly, catchable
 * error before ever attempting to load the native module on any non-Android platform — the UI layer
 * already gates on `Platform.OS === 'android'` too, so this is a defensive backstop, not the primary
 * guard.
 */
import { Platform } from 'react-native';
import type { SmsQueueEntry } from '../../modules/expo-sms-capture';
import { SMS_CAPTURE_NOT_SUPPORTED_MESSAGE } from './smsCapture.constants';

export type SmsPermissionStatus = 'granted' | 'denied';

function assertAndroid(): void {
  if (Platform.OS !== 'android') {
    throw new Error(SMS_CAPTURE_NOT_SUPPORTED_MESSAGE);
  }
}

async function getNativeModule() {
  const mod = await import('../../modules/expo-sms-capture');
  return mod.default;
}

/** Requests Android's `READ_SMS`/`RECEIVE_SMS` runtime permission together. Every caller MUST catch
 *  the thrown error (per CLAUDE.md's "never hard-crash" rule) and show a friendly message — never let
 *  this propagate uncaught. */
export async function requestSmsPermission(): Promise<SmsPermissionStatus> {
  assertAndroid();
  const native = await getNativeModule();
  const status = await native.requestPermissionAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

/**
 * Current grant status WITHOUT prompting (plan §7/§8 — "detect revocation on next foreground, never
 * fail silently") — used by `SmsTrackingSettingsPage`'s own `AppState`-foreground check to notice the
 * user revoked `READ_SMS`/`RECEIVE_SMS` from OS Settings after previously granting it, since Android
 * gives no in-app callback for that. Every caller MUST catch the thrown error, same contract as every
 * other export here.
 */
export async function getSmsPermissionStatus(): Promise<SmsPermissionStatus> {
  assertAndroid();
  const native = await getNativeModule();
  const status = await native.getPermissionStatusAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

/**
 * Scans the device's SMS inbox between `fromDate`/`toDate` (epoch ms, inclusive), invoking `onMessage`
 * once per message found — the caller passes `useSmsTracking()`'s `processRawSms` as `onMessage`, so
 * every scanned message flows through the exact same parse/match/resolve pipeline a live-captured
 * message does. Every caller MUST catch the thrown error and show a friendly, non-crashing message.
 */
export async function scanSmsInbox(
  fromDate: number,
  toDate: number,
  onMessage: (sender: string, body: string, receivedAt: number) => Promise<void>
): Promise<void> {
  assertAndroid();
  const native = await getNativeModule();
  const messages = await native.queryInboxAsync(fromDate, toDate);
  for (const message of messages) {
    await onMessage(message.sender, message.body, message.receivedAt);
  }
}

/**
 * Drains whatever the native live-capture path (`SmsReceiver.kt`) has queued since the last drain.
 * Additive to the original two-function seam (not a signature change to either) — called by the
 * Headless JS task (`~/lib/smsHeadlessTask.ts`) and, as the documented fallback for when that headless
 * wiring doesn't actually run under a given OS/battery-optimization state (plan §2), on next app
 * foreground.
 */
export async function drainPendingSmsQueue(): Promise<SmsQueueEntry[]> {
  assertAndroid();
  const native = await getNativeModule();
  return native.drainPendingQueueAsync();
}
