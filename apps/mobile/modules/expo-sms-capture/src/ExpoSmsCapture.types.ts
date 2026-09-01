/**
 * One raw SMS tuple as handed from native to JS — either from a historical `content://sms/inbox`
 * query (`queryInboxAsync`), or drained from the native queue `SmsReceiver.kt` populates on live
 * capture (`drainPendingQueueAsync`). Deliberately the rawest possible shape (no parsing/matching
 * yet) — `packages/core/src/core/sms-import/processRawSms.ts` is what turns this into a
 * `SmsTransactionRecord`, same as it does for every other source of a raw SMS.
 */
export interface SmsQueueEntry {
  sender: string;
  body: string;
  /** Epoch ms. */
  receivedAt: number;
}

export type SmsPermissionStatusString = 'granted' | 'denied';
