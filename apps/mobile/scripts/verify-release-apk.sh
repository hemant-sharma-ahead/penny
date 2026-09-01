#!/usr/bin/env bash
# Verifies a rebuilt release APK actually launches on a real connected device — on BOTH a
# genuinely fresh install and a warm relaunch of an already-onboarded install — before it is ever
# committed to apps/mobile/builds/.
#
# Written 2026-08-25 after the second release APK in three days (v1.5.2, then v1.6.0) was shipped
# without this check and crashed on launch. v1.6.0's crash specifically only reproduced on a fresh
# install, never on a warm relaunch of an existing install — a plain "does it launch" spot-check
# would have missed it, which is why this script always runs both, not either. See
# docs/ARCHITECTURE.md's 2026-08-25 decision-log entry for the full incident writeup.
#
# Usage: apps/mobile/scripts/verify-release-apk.sh [path-to-apk]
#   Defaults to apps/mobile/builds/app-arm64-v8a-release.apk (the file this project commits).
# Exit code 0 = both checks passed. Non-zero = do NOT commit the APK; see the printed failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APK="${1:-$REPO_ROOT/apps/mobile/builds/app-arm64-v8a-release.apk}"
PACKAGE="com.hesh.penny"
ACTIVITY="com.hesh.penny/.MainActivity"

if [ ! -f "$APK" ]; then
  echo "FAIL: APK not found at $APK" >&2
  exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "FAIL: adb not on PATH — cannot verify. Do not commit this APK unverified; say so explicitly instead." >&2
  exit 1
fi

DEVICE_COUNT=$(adb devices | grep -c "	device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  echo "FAIL: no authorized device connected (\`adb devices\` shows none) — cannot verify." >&2
  echo "Do not commit this APK unverified; say so explicitly and wait for a device instead." >&2
  exit 1
fi

check_alive() {
  local label="$1"
  sleep 6
  if adb shell ps -A 2>/dev/null | grep -q "$PACKAGE"; then
    echo "  $label: alive"
    return 0
  else
    echo "  $label: CRASHED"
    echo "  --- logcat crash signatures ---"
    adb logcat -d 2>&1 | grep -iE "FATAL EXCEPTION|Fatal signal|ReactNativeJS.*Error" | tail -20 || true
    return 1
  fi
}

FAILED=0

echo "=== Fresh install (uninstall + install + launch) ==="
adb uninstall "$PACKAGE" >/dev/null 2>&1 || true
adb install "$APK" >/dev/null
adb logcat -c
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
check_alive "Fresh install" || FAILED=1

echo "=== Warm relaunches x3 (same install, no reinstall) ==="
for i in 1 2 3; do
  adb logcat -c
  adb shell am force-stop "$PACKAGE"
  adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  check_alive "Warm relaunch $i" || FAILED=1
done

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "FAIL: at least one launch crashed. Do not commit this APK — find and fix the actual cause" >&2
  echo "(see CONTRIBUTING.md's \"Debugging a native-only crash\" section), or revert the suspected" >&2
  echo "change and re-run this script before shipping anything." >&2
  exit 1
fi

echo ""
echo "PASS: fresh install and all 3 warm relaunches stayed alive with no crash signatures."
