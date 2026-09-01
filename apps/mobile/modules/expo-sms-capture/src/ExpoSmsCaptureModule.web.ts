import { NativeModule, registerWebModule } from 'expo';

import type { SmsPermissionStatusString, SmsQueueEntry } from './ExpoSmsCapture.types';

const NOT_SUPPORTED_MESSAGE = 'expo-sms-capture is Android-only — not available on this platform';

// SMS Tracking is Android-only, full stop (docs/plans/sms-transaction-tracking.md §2 — no browser
// telephony/SMS API exists). The UI layer already gates on `Platform.OS === 'android'` before ever
// calling into `~/lib/smsCapture`, so these throwing stubs are only ever a defensive backstop, never
// expected to actually run.
class ExpoSmsCaptureModule extends NativeModule<Record<string, never>> {
  async requestPermissionAsync(): Promise<SmsPermissionStatusString> {
    throw new Error(NOT_SUPPORTED_MESSAGE);
  }

  async getPermissionStatusAsync(): Promise<SmsPermissionStatusString> {
    throw new Error(NOT_SUPPORTED_MESSAGE);
  }

  async queryInboxAsync(_fromDateMs: number, _toDateMs: number): Promise<SmsQueueEntry[]> {
    void _fromDateMs;
    void _toDateMs;
    throw new Error(NOT_SUPPORTED_MESSAGE);
  }

  async drainPendingQueueAsync(): Promise<SmsQueueEntry[]> {
    throw new Error(NOT_SUPPORTED_MESSAGE);
  }
}

export default registerWebModule(ExpoSmsCaptureModule, 'ExpoSmsCaptureModule');
