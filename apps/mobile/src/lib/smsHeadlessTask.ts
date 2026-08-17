/**
 * Headless JS task for the SMS-Based Expense Auto-Tracking live-capture path
 * (docs/plans/sms-transaction-tracking.md §2) — started by the native side
 * (`modules/expo-sms-capture/android/.../SmsProcessingWorker.kt` → `SmsHeadlessTaskService.kt`) once
 * `WorkManager` runs the job `SmsReceiver.kt` enqueued for a newly-arrived SMS.
 *
 * `registerSmsHeadlessTask()` MUST be called exactly once, at JS bundle load (see `index.ts`, its only
 * call site) — a Headless JS task can spin up in a background React instance that never renders `App`,
 * so registration can't live inside a component/hook; it has to run as a top-level side effect that
 * always executes regardless of whether anything ever mounts.
 *
 * **The plan's documented fallback, made concrete rather than a separate code path**: if the Data
 * Master Key isn't unlocked when this task fires, it does nothing at all and leaves the native queue
 * (`SmsQueueStore.kt`) untouched. The DMK is in-memory-only and cleared on session expiry
 * (`packages/core/src/core/crypto/keystore.ts`) — a headless JS context spun up because the app
 * process was fully killed has no way to decrypt an `EncryptedRepository` read/write, and there is no
 * way to prompt for a passphrase from a headless context. In that case the queued messages simply stay
 * durably queued natively until the app is next opened and unlocked, at which point
 * `useSmsTracking.ts`'s own foreground-drain effect drains the same queue through the exact same
 * `processRawSmsCore` pipeline this task uses. Both routes are the same drain, just triggered at
 * different times depending on whether the DMK happens to be available — never a message silently
 * lost, only ever delayed to next foreground in the locked case.
 */
import { AppRegistry } from 'react-native';
import {
  accountsRepo,
  expensesRepo,
  smsAccountMappingsRepo,
  smsExcludedSendersRepo,
  smsTransactionsRepo
} from '@/core/db/repositories';
import { keystore } from '@/core/crypto/keystore';
import { processRawSmsCore } from '@/core/sms-import/processRawSms';
import { drainPendingSmsQueue } from './smsCapture';

export const SMS_HEADLESS_TASK_NAME = 'PennySmsProcessing';

export function registerSmsHeadlessTask(): void {
  AppRegistry.registerHeadlessTask(SMS_HEADLESS_TASK_NAME, () => runSmsHeadlessTask);
}

async function runSmsHeadlessTask(): Promise<void> {
  if (!keystore.isUnlocked()) return; // see this module's own doc comment — native queue stays intact

  try {
    const pending = await drainPendingSmsQueue();
    if (pending.length === 0) return;

    const [accounts, mappings, expenses, excludedSenderRecords] = await Promise.all([
      accountsRepo.getAll(),
      smsAccountMappingsRepo.getAll(),
      expensesRepo.getAll(),
      smsExcludedSendersRepo.getAll()
    ]);
    const excludedSenders = excludedSenderRecords.map((r) => r.sender);
    let records = await smsTransactionsRepo.getAll();

    for (const message of pending) {
      try {
        const record = await processRawSmsCore(message.sender, message.body, message.receivedAt, {
          accounts,
          mappings,
          expenses,
          records,
          excludedSenders
        });
        if (record) {
          await smsTransactionsRepo.put(record);
          records = [...records.filter((r) => r.id !== record.id), record];
        }
      } catch {
        // Never let one bad message abort the rest of the batch (CLAUDE.md's never-hard-crash rule) —
        // that message is simply skipped for this run. Its own content is already gone from the native
        // queue at this point (drained above), so unlike the keystore-locked early return, there's no
        // queue to fall back to for this one specific message — accepted as a rare, better-than-a-crash
        // trade-off rather than risking an infinite reprocessing loop for something that will never
        // parse successfully.
      }
    }
  } catch {
    // A genuinely unexpected failure (e.g. the native module itself rejecting, or a repository read
    // failing right after the unlock check above raced a session expiry) — swallowed rather than
    // thrown, since an uncaught exception here has no user-facing surface to report to (this runs with
    // no UI, headless) and per CLAUDE.md the app must never hard-crash regardless of context.
  }
}
