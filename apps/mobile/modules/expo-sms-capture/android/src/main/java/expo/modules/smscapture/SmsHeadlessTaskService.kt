package expo.modules.smscapture

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Task key this service starts — MUST match the string passed to `AppRegistry.registerHeadlessTask`
 *  on the JS side (`apps/mobile/src/lib/smsHeadlessTask.ts`). */
const val SMS_HEADLESS_TASK_NAME = "PennySmsProcessing"

/** Started by [SmsProcessingWorker] once `WorkManager` runs the enqueued job
 *  (docs/plans/sms-transaction-tracking.md §2) — bridges to React Native's own `HeadlessJsTaskService`
 *  (spins up a background React instance if the app process isn't already running one, reuses the
 *  existing one otherwise) to run [SMS_HEADLESS_TASK_NAME]. That JS task drains
 *  [SmsQueueStore] and processes each message through `packages/core`'s `processRawSmsCore` — the
 *  exact same pipeline the foreground app's manual scan uses.
 *
 * No task data needs to cross the native→JS boundary here: the JS task reads directly from
 * [SmsQueueStore] via the native module's own `drainPendingQueueAsync()`, rather than this service
 * trying to serialize the queued messages into the task's `Bundle` itself. */
class SmsHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    // Positional args deliberately, not named — `HeadlessJsTaskConfig` is a plain RN Java class, and
    // Kotlin can only use named arguments against a Java constructor when it was compiled with
    // parameter-name metadata retained, which isn't guaranteed here.
    return HeadlessJsTaskConfig(SMS_HEADLESS_TASK_NAME, Arguments.createMap(), 30_000L, true)
  }
}
