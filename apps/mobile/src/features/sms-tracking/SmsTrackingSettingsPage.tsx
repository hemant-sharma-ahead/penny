import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View, Pressable, ScrollView, Text, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, ListContainer, SectionLabel, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
import type { HomeStackParamList } from '~/navigation/HomeStack';
import { useSettings } from '~/context/SettingsContext';
import { useToast } from '~/context/ToastContext';
import { requestSmsPermission, scanSmsInbox, getSmsPermissionStatus, drainPendingSmsQueue } from '~/lib/smsCapture';
import { useSmsTracking } from './useSmsTracking';
import { ScanDateRangeModal } from './ScanDateRangeModal';
import { MappingEditModal } from './MappingEditModal';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

type FlowStep = 'idle' | 'education' | 'scanChoice' | 'scanning';
type ScanChoice = 'last3Months' | 'custom' | 'skip';

const DAY_MS = 86_400_000;

/**
 * Settings → SMS Tracking (docs/plans/sms-transaction-tracking.md §7, mockup
 * docs/mockups/proposals/sms-transaction-tracking-v1.html §1) — mirrors `SafeModeSettingsPage.tsx`'s
 * own-sub-page structure. One screen, several internal steps (matching `ImportPage.tsx`'s own
 * step-machine-in-one-screen shape) rather than several navigation routes, since every step here is a
 * single linear on-flow the user only ever walks through once per toggle-on.
 *
 * `requestSmsPermission()`/`scanSmsInbox()` (`~/lib/smsCapture.native.ts`) are backed by a real local
 * Expo Module (`modules/expo-sms-capture/`) on Android — see that file's own doc comment for what's
 * still unverified pending a real device test (native SMS injection can't be simulated). RN-Web and
 * iOS never reach either call (`isAndroid` gates every path below); their own variant
 * (`~/lib/smsCapture.web.ts`) always throws defensively. Every step below that calls either is still
 * wrapped in try/catch and shows a friendly toast, never crashes, per CLAUDE.md's never-hard-crash rule
 * — this matters doubly here since a real device's OS-level permission dialog/content-provider query can
 * genuinely fail in ways a stub never could.
 *
 * Also owns the plan's §7/§8 permission-revoked-detection banner and the native pending-queue's
 * on-foreground drain (the fallback path for whenever the Headless-JS-under-WorkManager live-capture
 * wiring didn't run — see `~/lib/smsHeadlessTask.ts`'s own doc comment) — both driven by one `AppState`
 * "app became active" check, since Android gives no in-app callback for either an OS-Settings
 * permission revocation or "a headless task silently didn't get to run".
 */
export function SmsTrackingSettingsPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'SmsTrackingSettings'>>();
  const { showToast } = useToast();
  const { smsTrackingEnabled, setSmsTrackingEnabled } = useSettings();
  const sms = useSmsTracking();

  const [flowStep, setFlowStep] = useState<FlowStep>('idle');
  const [scanChoice, setScanChoice] = useState<ScanChoice>('last3Months');
  const [showScanRangeModal, setShowScanRangeModal] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [permissionRevoked, setPermissionRevoked] = useState(false);

  const isAndroid = Platform.OS === 'android';
  const isScanning = flowStep === 'scanning';
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  useRegisterHeaderScreen('SmsTrackingSettings', isScanning ? null : goBack, isScanning);
  useEffect(() => {
    navigation.setParams({ scanLocked: isScanning });
  }, [isScanning, navigation]);

  // Mirrors `useSmsTracking.ts`'s own `recordsRef` pattern — `sms`'s own object identity is fresh
  // every render (its individual functions are memoized, the wrapper object isn't), so this lets the
  // `AppState` effect below always call today's `processRawSms`/`reload` without needing `sms` itself
  // in its dependency array (which would tear the subscription down and rebuild it every render).
  const smsRef = useRef(sms);
  useEffect(() => {
    smsRef.current = sms;
  }, [sms]);

  /** Drains the native pending-SMS queue (messages captured while the app/JS engine wasn't around to
   *  process them live — see `~/lib/smsHeadlessTask.ts`) and processes each into the same pipeline as a
   *  live-captured message, reloading `useSmsTracking`'s state only if anything was actually pending.
   *  Extracted so both the on-foreground drain below and the steady-state pull-to-refresh handler share
   *  one processing loop instead of two copies that could quietly drift apart. */
  const drainAndProcessPendingSms = useCallback(async () => {
    const pending = await drainPendingSmsQueue();
    for (const message of pending) {
      await smsRef.current.processRawSms(message.sender, message.body, message.receivedAt);
    }
    if (pending.length > 0) smsRef.current.reload();
  }, []);

  // Permission-revoked detection + native-queue foreground drain (plan §7/§8: "detect revocation on
  // next foreground, never fail silently"; plan §2's documented on-foreground fallback for whenever
  // the Headless-JS-under-WorkManager live-capture path didn't/couldn't run — see
  // `~/lib/smsHeadlessTask.ts`'s own doc comment for the keystore-locked case this covers). Runs once
  // on mount (covers "just navigated to this screen") and again on every subsequent app foreground —
  // Android gives no in-app callback for an OS-Settings permission revocation, so polling on foreground
  // is the only way to notice it happened at all.
  useEffect(() => {
    if (!isAndroid || !smsTrackingEnabled) return;

    async function checkAndDrain() {
      try {
        const status = await getSmsPermissionStatus();
        setPermissionRevoked(status === 'denied');
      } catch {
        // Defensive only — a broken native call here shouldn't crash the settings screen; just skip
        // this foreground's revocation check, try again next time.
      }
      try {
        await drainAndProcessPendingSms();
      } catch {
        // Best-effort — a stuck/broken native queue drain isn't worth a toast on every foreground;
        // whatever's pending simply gets retried on the next one instead (never lost either way, per
        // `SmsQueueStore.kt`'s own doc comment: nothing is cleared from the native queue until a drain
        // actually returns successfully).
      }
    }

    void checkAndDrain();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAndDrain();
    });
    return () => subscription.remove();
  }, [isAndroid, smsTrackingEnabled, drainAndProcessPendingSms]);

  /** Reports how many raw SMS the native query actually returned for the chosen range — silence on
   *  success (previously the only feedback was an error toast) made "found nothing" indistinguishable
   *  from "scan didn't really run": a genuinely empty range, a permission/content-provider read that
   *  silently returned zero rows, and a real bug all looked identical to the user. This number alone
   *  tells them which bucket they're in before they even check the Unparsed/mappings sections below. */
  async function runScan(fromDate: number, toDate: number) {
    setFlowStep('scanning');
    let scannedCount = 0;
    try {
      await scanSmsInbox(fromDate, toDate, async (sender, body, receivedAt) => {
        scannedCount++;
        await sms.processRawSms(sender, body, receivedAt);
      });
      showToast({
        message:
          scannedCount === 0
            ? "No SMS found in that date range — check the range, or that this device's default SMS app has messages there."
            : `Scanned ${scannedCount} message${scannedCount === 1 ? '' : 's'} from that range.`,
        durationMs: 5000
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      showToast({ message: `Couldn't scan SMS: ${detail}`, durationMs: 6000 });
    } finally {
      setSmsTrackingEnabled(true);
      setFlowStep('idle');
      sms.reload();
    }
  }

  async function handleContinueFromEducation() {
    try {
      const status = await requestSmsPermission();
      if (status === 'granted') {
        setFlowStep('scanChoice');
      } else {
        showToast({ message: 'Permission wasn’t granted — SMS Tracking stays off.' });
        setFlowStep('idle');
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      showToast({
        message: `SMS capture isn't available in this build yet — turning tracking on so everything is ready for it. (${detail})`,
        durationMs: 6000
      });
      setSmsTrackingEnabled(true);
      setFlowStep('idle');
    }
  }

  function handleScanChoiceContinue() {
    if (scanChoice === 'skip') {
      setSmsTrackingEnabled(true);
      setFlowStep('idle');
      return;
    }
    if (scanChoice === 'custom') {
      // Reuses the same standing "Scan a date range" modal (chip presets + custom fields) rather than a
      // second bespoke date-range UI just for this one-time setup path.
      setSmsTrackingEnabled(true);
      setFlowStep('idle');
      setShowScanRangeModal(true);
      return;
    }
    const now = Date.now();
    void runScan(now - 90 * DAY_MS, now);
  }

  // Pull-to-refresh for the steady-state ("on") view only — re-reads sender mappings/records/accounts/
  // expenses via `sms.reload()` and drains+processes anything the native queue picked up since the last
  // foreground check, via the same `drainAndProcessPendingSms` the AppState effect above uses. Deliberately
  // does NOT trigger `scanSmsInbox` (the historical-inbox scan) — that stays a deliberate explicit action
  // via "Scan a date range" only, never something a pull-down gesture kicks off.
  const refreshSteadyState = useCallback(async () => {
    sms.reload();
    await drainAndProcessPendingSms();
  }, [sms, drainAndProcessPendingSms]);
  const { refreshing: steadyRefreshing, onRefresh: onSteadyRefresh } = usePullToRefresh(refreshSteadyState);

  if (!isAndroid) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
          <SectionLabel>Data &amp; activity</SectionLabel>
          <ListContainer>
            <View className="flex-row items-center gap-3 px-3 py-2.5">
              <View className="w-8 h-8 rounded-[9px] items-center justify-center bg-surface-3">
                <Icon name="ti-message-2" size={14} color={theme.textTertiary} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-tertiary">Track expenses from SMS</Text>
                <Text className="text-[11px] text-tertiary">Android only</Text>
              </View>
              <View className="rounded-full px-2 py-1 bg-surface-3">
                <Text className="text-[9px] font-bold uppercase tracking-wide text-tertiary">Unavailable</Text>
              </View>
            </View>
          </ListContainer>
          <Banner variant="info">
            SMS reading isn&apos;t available on iOS or in a browser — neither exposes an SMS API to any app. This is an
            Android-only capability.
          </Banner>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (flowStep === 'education') {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 10 }}>
          <View className="items-center gap-2 mb-2">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-message-2" size={26} color="#fff" />
            </View>
            <Text className="text-base font-bold text-primary text-center">Why Penny needs SMS access</Text>
            <Text className="text-xs text-secondary text-center leading-relaxed">
              So bank transactions can appear the moment they arrive — without typing them in.
            </Text>
          </View>

          {[
            {
              icon: 'ti-bolt',
              title: 'Instant capture',
              body: 'New transaction SMS from your banks become draft expenses within moments of arriving.'
            },
            {
              icon: 'ti-history',
              title: 'Backfill on demand',
              body: 'Read a date range of your SMS inbox — the only way to backfill history, since Android keeps no old notification log.'
            },
            {
              icon: 'ti-device-mobile-lock',
              title: 'Everything stays on your device',
              body: 'Only a small list of bank message formats is fetched from Penny’s server. Your SMS text — and every number extracted from it — is matched entirely on your phone, never uploaded.'
            },
            {
              icon: 'ti-toggle-left',
              title: 'You’re always in control',
              body: 'Turn this off anytime. Every detected transaction waits in a review queue — nothing is recorded until you confirm it.'
            }
          ].map((pillar) => (
            <View
              key={pillar.title}
              className="flex-row items-start gap-2.5 rounded-xl border border-theme bg-surface-2 p-2.5"
            >
              <View
                className="w-7 h-7 rounded-lg items-center justify-center flex-shrink-0"
                style={{ backgroundColor: theme.primary }}
              >
                <Icon name={pillar.icon} size={14} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-primary">{pillar.title}</Text>
                <Text className="text-[10px] text-secondary leading-relaxed mt-0.5">{pillar.body}</Text>
              </View>
            </View>
          ))}

          <View className="flex-row gap-2 mt-1">
            <View className="flex-1">
              <Button variant="ghost" fullWidth onPress={() => setFlowStep('idle')}>
                Not now
              </Button>
            </View>
            <View style={{ flex: 2 }}>
              <Button variant="primary" fullWidth onPress={() => void handleContinueFromEducation()}>
                Continue
              </Button>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (flowStep === 'scanChoice') {
    const choices: { value: ScanChoice; icon: string; title: string; sub: string }[] = [
      {
        value: 'last3Months',
        icon: 'ti-calendar-time',
        title: 'Last 3 months (recommended)',
        sub: 'A bounded starting window — good for most users.'
      },
      {
        value: 'custom',
        icon: 'ti-calendar-event',
        title: 'Custom date range',
        sub: 'Pick your own start and end dates.'
      },
      {
        value: 'skip',
        icon: 'ti-player-skip-forward',
        title: 'Skip — only new messages',
        sub: 'Don’t scan history; track from now on.'
      }
    ];
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Banner variant="success">Permission granted. Want us to scan your existing SMS for transactions?</Banner>
          {choices.map((choice) => {
            const on = scanChoice === choice.value;
            return (
              <Pressable
                key={choice.value}
                onPress={() => setScanChoice(choice.value)}
                className="flex-row items-start gap-2.5 rounded-xl border-2 p-2.5"
                style={{
                  borderColor: on ? theme.primary : theme.border,
                  backgroundColor: on ? tint(theme.primary, 8) : 'transparent'
                }}
              >
                <View
                  className="w-4 h-4 rounded-full border-2 items-center justify-center mt-0.5"
                  style={{ borderColor: on ? theme.primary : theme.border }}
                >
                  {on && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary }} />}
                </View>
                <View
                  className="w-7 h-7 rounded-lg items-center justify-center"
                  style={{ backgroundColor: on ? tint(theme.primary, 16) : theme.surfaceSecondary }}
                >
                  <Icon name={choice.icon} size={14} color={on ? theme.primary : theme.textSecondary} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-primary">{choice.title}</Text>
                  <Text className="text-[10px] text-secondary mt-0.5">{choice.sub}</Text>
                </View>
              </Pressable>
            );
          })}
          <Button variant="primary" fullWidth onPress={handleScanChoiceContinue}>
            Continue
          </Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isScanning) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Icon name="ti-loader-2" size={28} color={theme.primary} spin />
          <Text className="text-sm font-semibold text-primary">Scanning SMS…</Text>
          <Text className="text-xs text-secondary text-center">
            This won’t take long — you can’t leave this screen until it finishes.
          </Text>
          <View className="flex-row items-center gap-1.5 mt-2">
            <Icon name="ti-lock" size={10} color={theme.textTertiary} />
            <Text className="text-[9px] font-bold uppercase tracking-wide text-tertiary">
              Back is locked until this finishes
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!smsTrackingEnabled) {
    return (
      <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
          <ListContainer>
            <View className="flex-row items-center gap-3 px-3 py-2.5">
              <View
                className="w-8 h-8 rounded-[9px] items-center justify-center"
                style={{ backgroundColor: tint(theme.neutral, 16) }}
              >
                <Icon name="ti-message-2" size={14} color={theme.neutral} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-primary">Track expenses from SMS</Text>
                <Text className="text-[11px] text-tertiary">
                  Detect bank SMS and turn them into transactions automatically
                </Text>
              </View>
              <Toggle
                value={false}
                onChange={(v) => setFlowStep(v ? 'education' : 'idle')}
                accessibilityLabel="Track expenses from SMS"
              />
            </View>
          </ListContainer>
          <Banner variant="info">
            Android only. When you turn this on we&apos;ll explain exactly what it needs — and why — before your
            phone&apos;s own permission dialog ever appears.
          </Banner>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Steady state — "on".
  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 4 }}
        refreshControl={
          <RefreshControl refreshing={steadyRefreshing} onRefresh={onSteadyRefresh} tintColor={theme.primary} />
        }
      >
        {permissionRevoked && (
          <Banner variant="warning" className="mb-2">
            SMS permission was turned off in your phone&apos;s Settings — Penny can&apos;t read new transaction messages
            until you grant it again.
          </Banner>
        )}
        <ListContainer className="mb-2">
          <View className="flex-row items-center gap-3 px-3 py-2.5">
            <View
              className="w-8 h-8 rounded-[9px] items-center justify-center"
              style={{ backgroundColor: tint(theme.primary, 16) }}
            >
              <Icon name="ti-message-2" size={14} color={theme.primary} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-medium text-primary">Track expenses from SMS</Text>
              <Text className="text-[11px] text-tertiary">On</Text>
            </View>
            <Toggle
              value
              onChange={(v) => !v && setSmsTrackingEnabled(false)}
              accessibilityLabel="Track expenses from SMS"
            />
          </View>
        </ListContainer>

        <SectionLabel>Backfill</SectionLabel>
        <ListContainer className="mb-2">
          <Pressable onPress={() => setShowScanRangeModal(true)} className="flex-row items-center gap-3 px-3 py-2.5">
            <View
              className="w-8 h-8 rounded-[9px] items-center justify-center"
              style={{ backgroundColor: tint(theme.info, 16) }}
            >
              <Icon name="ti-calendar-search" size={14} color={theme.info} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-medium text-primary">Scan a date range</Text>
              <Text className="text-[11px] text-tertiary">
                Backfill any time — e.g. after a restore, or to fill a gap
              </Text>
            </View>
            <Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />
          </Pressable>
        </ListContainer>

        <SectionLabel>Review</SectionLabel>
        <ListContainer className="mb-2">
          <Pressable
            onPress={() => navigation.navigate('SmsReview')}
            className="flex-row items-center gap-3 px-3 py-2.5"
          >
            <View
              className="w-8 h-8 rounded-[9px] items-center justify-center"
              style={{ backgroundColor: tint(theme.primary, 16) }}
            >
              <Icon name="ti-inbox" size={14} color={theme.primary} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-medium text-primary">Review queue</Text>
              <Text className="text-[11px] text-tertiary">Linked, needs review, new &amp; ignored</Text>
            </View>
            {sms.reviewQueueCount > 0 && (
              <View className="rounded-full px-1.5 py-0.5 mr-1" style={{ backgroundColor: tint(theme.info, 16) }}>
                <Text className="text-[9.5px] font-extrabold" style={{ color: theme.info }}>
                  {sms.reviewQueueCount}
                </Text>
              </View>
            )}
            <Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('SmsUnparsedMessages')}
            className="flex-row items-center gap-3 px-3 py-2.5 border-t border-theme"
          >
            <View
              className="w-8 h-8 rounded-[9px] items-center justify-center"
              style={{ backgroundColor: tint(theme.warning, 16) }}
            >
              <Icon name="ti-alert-triangle" size={14} color={theme.warning} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-medium text-primary">Unparsed messages</Text>
              <Text className="text-[11px] text-tertiary">From banks Penny recognizes, but couldn&apos;t parse</Text>
            </View>
            {sms.unparsed.length > 0 && (
              <View className="rounded-full px-1.5 py-0.5 mr-1" style={{ backgroundColor: tint(theme.warning, 16) }}>
                <Text className="text-[9.5px] font-extrabold" style={{ color: theme.warning }}>
                  {sms.unparsed.length}
                </Text>
              </View>
            )}
            <Icon name="ti-chevron-right" size={17} color={theme.textTertiary} />
          </Pressable>
        </ListContainer>

        <SectionLabel>Sender mapping</SectionLabel>
        <Text className="text-[10.5px] text-secondary -mt-1 mb-2">
          What Penny has learned about your banks&apos; SMS senders — fix anything that&apos;s wrong.
        </Text>
        {sms.mappings.length === 0 ? (
          <Text className="text-xs text-tertiary py-2">No senders mapped yet.</Text>
        ) : (
          <ListContainer>
            {sms.mappings.map((mapping, i) => (
              <Pressable
                key={mapping.id}
                onPress={() => setEditingMappingId(mapping.id)}
                className={`flex-row items-center gap-2.5 px-3 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                    {mapping.rawValue}
                  </Text>
                  <Text className="text-[9px] text-tertiary mt-0.5">
                    {mapping.kind === 'card_last4' ? 'Card → underlying account' : 'Bank-string mapping'}
                  </Text>
                </View>
                <Icon name="ti-arrow-right" size={11} color={theme.textTertiary} />
                <Text className="text-xs font-bold text-primary">
                  {sms.accountsById.get(mapping.accountId)?.name ?? 'Unknown account'}
                </Text>
                <Icon name="ti-chevron-right" size={16} color={theme.textTertiary} />
              </Pressable>
            ))}
          </ListContainer>
        )}
        <Text className="text-[9.5px] text-tertiary leading-relaxed mt-2 mb-4">
          New senders are added here automatically the first time we recognize one from a known bank — never silently
          guessed.
        </Text>
      </ScrollView>

      {showScanRangeModal && (
        <ScanDateRangeModal
          onClose={() => setShowScanRangeModal(false)}
          onStart={(fromDate, toDate) => {
            setShowScanRangeModal(false);
            // Reuses runScan() (same scanned-count toast, same error handling) rather than a second,
            // slowly-diverging copy of the same scan+report logic — this modal previously had its own
            // near-identical block with no completion feedback at all on the happy path.
            void runScan(fromDate, toDate);
          }}
        />
      )}

      {editingMappingId && (
        <MappingEditModal
          sms={sms}
          mapping={sms.mappings.find((m) => m.id === editingMappingId) ?? null}
          onClose={() => setEditingMappingId(null)}
        />
      )}
    </SafeAreaView>
  );
}
