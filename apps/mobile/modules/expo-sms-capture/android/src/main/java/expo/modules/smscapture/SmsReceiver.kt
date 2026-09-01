package expo.modules.smscapture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

/**
 * Fires on the protected `SMS_RECEIVED` system broadcast (docs/plans/sms-transaction-tracking.md §2)
 * — registered via `plugins/withSmsPermissions.js`'s manifest injection, high priority, even when
 * Penny's own process isn't currently running.
 *
 * Does the absolute minimum, per Android's ~10s `BroadcastReceiver` execution budget: persists the
 * raw `(sender, body, receivedAt)` tuple to [SmsQueueStore] and enqueues a `WorkManager` job. No
 * parsing/matching/DB access happens here — that's [SmsProcessingWorker]'s job, invoked reliably by
 * `WorkManager` (survives process death, Doze deferral, and reboot) rather than done inline.
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) return

    val receivedAt = System.currentTimeMillis()
    val appContext = context.applicationContext

    // A single logical SMS can arrive as multiple concatenated PDUs (a long message split across
    // segments) — group by originating address and reassemble, rather than queuing one fragment at
    // a time as if each were its own message.
    messages
      .groupBy { it.originatingAddress ?: "" }
      .filterKeys { it.isNotBlank() }
      .forEach { (sender, parts) ->
        val body = parts.joinToString(separator = "") { it.messageBody ?: "" }
        SmsQueueStore.enqueue(appContext, sender, body, receivedAt)
      }

    WorkManager.getInstance(appContext).enqueue(OneTimeWorkRequestBuilder<SmsProcessingWorker>().build())
  }
}
