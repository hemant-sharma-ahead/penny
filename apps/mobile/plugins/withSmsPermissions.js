const { withAndroidManifest } = require('expo/config-plugins');

// SMS-Based Expense Auto-Tracking (docs/plans/sms-transaction-tracking.md §2) — Android-only, injects
// the READ_SMS/RECEIVE_SMS runtime permissions plus the manifest entries the native capture layer
// needs: a high-priority <receiver> for the protected SMS_RECEIVED system broadcast (handled by
// `modules/expo-sms-capture`'s `SmsReceiver.kt`), and the <service> that broadcast's enqueued
// WorkManager job eventually starts to run the Headless JS processing task
// (`SmsHeadlessTaskService.kt`). Mirrors `withAbiSplits.js`'s style — a plain `expo prebuild`
// regenerates `android/app/src/main/AndroidManifest.xml` from scratch, so these entries have to be
// injected via a config plugin to survive that, never hand-edited into the generated file.
//
// Never touches iOS or web — Apple has no public SMS-reading API at all (plan §2), and this plugin is
// registered as Android-only in `app.json`'s `plugins` array by only calling `withAndroidManifest`.

const READ_SMS_PERMISSION = 'android.permission.READ_SMS';
const RECEIVE_SMS_PERMISSION = 'android.permission.RECEIVE_SMS';

// Fully-qualified names inside the local `expo-sms-capture` module's own Kotlin package — NOT the
// app's own package (`android.package` in app.json), since these classes live in the module, not the
// generated app project.
const SMS_RECEIVER_CLASS = 'expo.modules.smscapture.SmsReceiver';
const SMS_HEADLESS_TASK_SERVICE_CLASS = 'expo.modules.smscapture.SmsHeadlessTaskService';

function ensureUsesPermission(androidManifest, permissionName) {
  const manifest = androidManifest.manifest;
  manifest['uses-permission'] = manifest['uses-permission'] ?? [];
  const alreadyPresent = manifest['uses-permission'].some((entry) => entry.$?.['android:name'] === permissionName);
  if (!alreadyPresent) {
    manifest['uses-permission'].push({ $: { 'android:name': permissionName } });
  }
}

function getApplication(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application) {
    throw new Error('withSmsPermissions: no <application> tag found in AndroidManifest.xml');
  }
  return application;
}

function ensureSmsReceiver(application) {
  application.receiver = application.receiver ?? [];
  const alreadyPresent = application.receiver.some((entry) => entry.$?.['android:name'] === SMS_RECEIVER_CLASS);
  if (alreadyPresent) return;

  application.receiver.push({
    $: {
      'android:name': SMS_RECEIVER_CLASS,
      'android:exported': 'true',
      // SMS_RECEIVED is a protected system broadcast — the OS only delivers it to receivers that
      // declare this permission, so this is required (not optional hardening) for the receiver to
      // ever actually fire.
      'android:permission': 'android.permission.BROADCAST_SMS'
    },
    'intent-filter': [
      {
        // High priority (plan §2) so this receiver sees the broadcast promptly, ahead of any other
        // app's lower-priority receiver for the same action.
        $: { 'android:priority': '999' },
        action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }]
      }
    ]
  });
}

function ensureSmsHeadlessTaskService(application) {
  application.service = application.service ?? [];
  const alreadyPresent = application.service.some(
    (entry) => entry.$?.['android:name'] === SMS_HEADLESS_TASK_SERVICE_CLASS
  );
  if (alreadyPresent) return;

  application.service.push({
    $: {
      'android:name': SMS_HEADLESS_TASK_SERVICE_CLASS,
      // Only ever started from inside this app's own process (the WorkManager worker) — never
      // exposed to other apps.
      'android:exported': 'false'
    }
  });
}

module.exports = function withSmsPermissions(config) {
  return withAndroidManifest(config, (config) => {
    ensureUsesPermission(config.modResults, READ_SMS_PERMISSION);
    ensureUsesPermission(config.modResults, RECEIVE_SMS_PERMISSION);
    const application = getApplication(config.modResults);
    ensureSmsReceiver(application);
    ensureSmsHeadlessTaskService(application);
    return config;
  });
};
