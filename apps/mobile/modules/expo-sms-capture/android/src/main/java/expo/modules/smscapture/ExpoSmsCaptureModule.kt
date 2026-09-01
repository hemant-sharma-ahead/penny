package expo.modules.smscapture

import android.Manifest
import android.content.Context
import android.database.Cursor
import android.os.Bundle
import android.provider.Telephony
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Both permissions are always requested/checked together — Penny's SMS Tracking feature has no use
 *  for one without the other (docs/plans/sms-transaction-tracking.md §2: `READ_SMS` for historical
 *  inbox query, `RECEIVE_SMS` for live capture). */
private val SMS_PERMISSIONS = arrayOf(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)

/**
 * Android SMS-capture native surface for the SMS-Based Expense Auto-Tracking feature
 * (docs/plans/sms-transaction-tracking.md §2) — the implementation behind
 * `apps/mobile/src/lib/smsCapture.native.ts`'s seam. A genuine local Expo Module (not a third-party
 * package), scoped to exactly four operations: permission request/check, a historical inbox query
 * (backs the "scan a date range" standing capability), and draining whatever [SmsReceiver] has queued
 * natively since the live-capture path last ran.
 *
 * Deliberately never touches `packages/core`/Dexie/`EncryptedRepository` from here — this module's
 * only job is handing raw `(sender, body, receivedAt)` tuples to JS; every parsing/matching/account-
 * resolution/write decision happens entirely on the JS side (`packages/core/src/core/sms-import/`),
 * same as a manual scan.
 */
class ExpoSmsCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoSmsCapture")

    AsyncFunction("requestPermissionAsync") { promise: Promise ->
      val permissionsManager = appContext.permissions
      // `askForPermissionsWithPermissionsManager` resolves with a Bundle whose STATUS_KEY is the
      // AGGREGATE across every requested permission ("granted" only when ALL are granted) — exactly
      // the all-or-nothing semantics this feature needs, since READ_SMS-without-RECEIVE_SMS (or vice
      // versa) isn't a usable state.
      Permissions.askForPermissionsWithPermissionsManager(
        permissionsManager,
        object : Promise {
          override fun resolve(value: Any?) = promise.resolve(permissionStatusString(value))
          override fun reject(code: String?, message: String?, cause: Throwable?) = promise.resolve("denied")
        },
        *SMS_PERMISSIONS
      )
    }

    AsyncFunction("getPermissionStatusAsync") { promise: Promise ->
      // Checks current grant status WITHOUT prompting — used to detect a permission the user
      // revoked from OS Settings after previously granting it (plan §7's
      // permission-revoked-detection banner).
      val granted = appContext.permissions?.hasGrantedPermissions(*SMS_PERMISSIONS) ?: false
      promise.resolve(if (granted) "granted" else "denied")
    }

    AsyncFunction("queryInboxAsync") { fromDateMs: Double, toDateMs: Double ->
      queryInbox(reactContextOrThrow(), fromDateMs.toLong(), toDateMs.toLong())
    }

    AsyncFunction("drainPendingQueueAsync") {
      SmsQueueStore.drain(reactContextOrThrow())
    }
  }

  private fun reactContextOrThrow(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
}

private fun permissionStatusString(permissionsBundle: Any?): String {
  val status = (permissionsBundle as? Bundle)?.getString("status")
  return if (status == "granted") "granted" else "denied"
}

/** Queries `content://sms/inbox` for messages received in `[fromDateMs, toDateMs]` (inclusive), ASC
 *  by date — backs the "scan a date range" standing capability (plan §7), including the initial
 *  bounded historical backfill. Never touches any other SMS content provider table (sent/drafts/etc)
 *  — inbox only, matching the feature's scope of "SMS Penny actually received". */
private fun queryInbox(context: Context, fromDateMs: Long, toDateMs: Long): List<Map<String, Any>> {
  val results = mutableListOf<Map<String, Any>>()
  val projection = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
  val selection = "${Telephony.Sms.DATE} BETWEEN ? AND ?"
  val selectionArgs = arrayOf(fromDateMs.toString(), toDateMs.toString())
  val sortOrder = "${Telephony.Sms.DATE} ASC"

  val cursor: Cursor = try {
    context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, projection, selection, selectionArgs, sortOrder)
      ?: return results
  } catch (e: SecurityException) {
    throw Exceptions.MissingPermissions(*SMS_PERMISSIONS)
  }

  cursor.use {
    val addressIndex = it.getColumnIndex(Telephony.Sms.ADDRESS)
    val bodyIndex = it.getColumnIndex(Telephony.Sms.BODY)
    val dateIndex = it.getColumnIndex(Telephony.Sms.DATE)
    while (it.moveToNext()) {
      val sender = if (addressIndex >= 0) it.getString(addressIndex) else null
      val body = if (bodyIndex >= 0) it.getString(bodyIndex) else null
      val receivedAt = if (dateIndex >= 0) it.getLong(dateIndex) else 0L
      if (sender != null && body != null) {
        results.add(mapOf("sender" to sender, "body" to body, "receivedAt" to receivedAt.toDouble()))
      }
    }
  }
  return results
}
