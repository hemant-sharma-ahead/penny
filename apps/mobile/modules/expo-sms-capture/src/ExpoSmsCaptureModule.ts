import { NativeModule, requireNativeModule } from 'expo';

import type { SmsPermissionStatusString, SmsQueueEntry } from './ExpoSmsCapture.types';

declare class ExpoSmsCaptureModule extends NativeModule<Record<string, never>> {
  /** Requests `READ_SMS`+`RECEIVE_SMS` together (Android runtime permission dialog) — resolves
   *  `'granted'` only when BOTH are granted, `'denied'` otherwise. */
  requestPermissionAsync(): Promise<SmsPermissionStatusString>;
  /** Checks current grant status WITHOUT prompting — for permission-revoked detection
   *  (docs/plans/sms-transaction-tracking.md §7). */
  getPermissionStatusAsync(): Promise<SmsPermissionStatusString>;
  /** Queries `content://sms/inbox` for `date BETWEEN fromDateMs AND toDateMs` (inclusive, epoch ms). */
  queryInboxAsync(fromDateMs: number, toDateMs: number): Promise<SmsQueueEntry[]>;
  /** Returns and clears whatever `SmsReceiver` has queued natively since the last drain. */
  drainPendingQueueAsync(): Promise<SmsQueueEntry[]>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoSmsCaptureModule>('ExpoSmsCapture');
