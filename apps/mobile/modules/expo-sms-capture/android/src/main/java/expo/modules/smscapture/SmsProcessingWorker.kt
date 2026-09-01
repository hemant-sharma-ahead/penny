package expo.modules.smscapture

import android.content.Context
import android.content.Intent
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * `WorkManager`'s guaranteed-eventual-execution step (docs/plans/sms-transaction-tracking.md §2) —
 * enqueued by [SmsReceiver] for every received SMS batch. Its only job is to start
 * [SmsHeadlessTaskService], which runs the actual parsing/matching/write via a Headless JS task over
 * whatever [SmsQueueStore] currently holds (not just this specific invocation's own messages — the
 * headless task always drains the full queue, so it's naturally idempotent/coalescing if multiple
 * Worker runs end up overlapping).
 */
class SmsProcessingWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    // startService (not startForegroundService) — this is a short-lived, best-effort headless JS
    // run, not a long-running foreground operation the user needs to see. Android 8+'s background
    // service start restrictions can legitimately reject this when the app process is fully
    // backgrounded (a real, known rough edge of the Headless-JS-under-WorkManager combination flagged
    // in the plan) — caught defensively rather than crashing the Worker, because that's fine: the
    // queued messages simply remain durably queued (`SmsQueueStore`) until the app's own
    // next-foreground drain picks them up instead (plan §2's documented fallback). Never lost, only
    // delayed either way — the persistence step already happened in `SmsReceiver` regardless of
    // whether this headless run itself succeeds.
    try {
      applicationContext.startService(Intent(applicationContext, SmsHeadlessTaskService::class.java))
    } catch (_: Exception) {
      // Intentionally swallowed — see comment above.
    }
    return Result.success()
  }
}
