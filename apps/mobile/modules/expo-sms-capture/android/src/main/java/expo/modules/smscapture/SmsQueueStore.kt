package expo.modules.smscapture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

private const val PREFS_NAME = "expo_sms_capture_queue"
private const val QUEUE_KEY = "pending_messages"

/**
 * Minimal durable native-side queue, SharedPreferences-backed (docs/plans/sms-transaction-tracking.md
 * §2) — a `BroadcastReceiver` has a hard ~10s execution budget and must not do real work itself
 * (parsing/DB reads/writes), so [SmsReceiver] only persists the raw `(sender, body, receivedAt)`
 * tuple here before enqueuing a `WorkManager` job. The JS side — a Headless JS task if that wiring
 * holds up, else the documented fallback of draining on next app foreground — reads this queue via
 * [drain] and runs the real parsing/matching/write through `packages/core`'s own
 * `processRawSmsCore` pipeline, the exact same one the foreground app's manual scan uses.
 *
 * Deliberately NOT using `EncryptedRepository`/Dexie here: this is a tiny, transient, native-only
 * handoff buffer between the OS broadcast and the JS side draining it, not real app data — the
 * Data Master Key isn't necessarily available to decrypt anything at this layer anyway (this queue
 * exists precisely so raw SMS survive until whenever the DMK-unlocked JS side next runs). Every
 * entry here is removed by [drain] as soon as it's been handed off, so nothing durable/sensitive
 * accumulates natively long-term.
 */
object SmsQueueStore {
  @Synchronized
  fun enqueue(context: Context, sender: String, body: String, receivedAt: Long) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val queue = JSONArray(prefs.getString(QUEUE_KEY, "[]"))
    val entry = JSONObject().apply {
      put("sender", sender)
      put("body", body)
      put("receivedAt", receivedAt)
    }
    queue.put(entry)
    prefs.edit().putString(QUEUE_KEY, queue.toString()).apply()
  }

  /** Returns every entry queued since the last [drain] call, then clears the queue. */
  @Synchronized
  fun drain(context: Context): List<Map<String, Any>> {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val queue = JSONArray(prefs.getString(QUEUE_KEY, "[]"))
    val result = mutableListOf<Map<String, Any>>()
    for (i in 0 until queue.length()) {
      val entry = queue.getJSONObject(i)
      result.add(
        mapOf(
          "sender" to entry.getString("sender"),
          "body" to entry.getString("body"),
          "receivedAt" to entry.getLong("receivedAt").toDouble()
        )
      )
    }
    prefs.edit().putString(QUEUE_KEY, "[]").apply()
    return result
  }
}
