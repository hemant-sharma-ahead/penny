/**
 * SMS capture seam (docs/plans/sms-transaction-tracking.md §2) — RN-Web variant. SMS Tracking is
 * Android-only, full stop: no browser has an SMS/telephony read API at all. The UI layer
 * (`~/features/sms-tracking/SmsTrackingSettingsPage.tsx`) already gates on `Platform.OS === 'android'`
 * before ever calling either export below, so this file is only ever a defensive backstop — see
 * `smsCapture.native.ts` for the real Android implementation.
 */
import { SMS_CAPTURE_NOT_SUPPORTED_MESSAGE } from './smsCapture.constants';

export type SmsPermissionStatus = 'granted' | 'denied';

export async function requestSmsPermission(): Promise<SmsPermissionStatus> {
  throw new Error(SMS_CAPTURE_NOT_SUPPORTED_MESSAGE);
}

/** Web/iOS counterpart to `smsCapture.native.ts`'s `getSmsPermissionStatus` — kept type-symmetric even
 *  though nothing on this platform ever calls it (the settings screen never runs its revocation check
 *  off-Android). */
export async function getSmsPermissionStatus(): Promise<SmsPermissionStatus> {
  throw new Error(SMS_CAPTURE_NOT_SUPPORTED_MESSAGE);
}

export async function scanSmsInbox(
  _fromDate: number,
  _toDate: number,
  _onMessage: (sender: string, body: string, receivedAt: number) => Promise<void>
): Promise<void> {
  void _fromDate;
  void _toDate;
  void _onMessage;
  throw new Error(SMS_CAPTURE_NOT_SUPPORTED_MESSAGE);
}

/** Web/iOS counterpart to `smsCapture.native.ts`'s `drainPendingSmsQueue` — kept type-symmetric across
 *  both platform variants even though nothing on this platform ever calls it. */
export async function drainPendingSmsQueue(): Promise<Array<{ sender: string; body: string; receivedAt: number }>> {
  throw new Error(SMS_CAPTURE_NOT_SUPPORTED_MESSAGE);
}
