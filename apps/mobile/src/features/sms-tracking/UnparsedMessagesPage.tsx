import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Banner, PageHeader } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { useToast } from '~/context/ToastContext';
import { tint } from '~/lib/color';
import type { SmsExcludedSender, SmsTransactionRecord } from '@/core/db/types';
import { redactDigits } from '@/core/sms-import/smsParser';
import { formatDateTime } from '@/lib/date';
import { BANK_PRESET_LABELS } from '~/lib/bankPresetLabels';
import { useSmsTracking } from './useSmsTracking';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

/** Per-sender cap once a group is expanded — a single mis-templated bank sender can plausibly account
 *  for hundreds/thousands of unparsed messages on its own (a real historical "all time" scan), so this
 *  is scoped per-group rather than one global cap across the whole page (CLAUDE.md's bulk-render rule:
 *  first N + "show all", never an unbounded `.map()`). Collapsed groups render nothing but their header
 *  regardless of size, so there's no equivalent risk for the outer sender list itself. */
const RENDER_CAP_PER_GROUP = 30;

function MessageCard({
  sender,
  receivedAt,
  body,
  onDismiss
}: {
  sender: string;
  receivedAt: number;
  body: string;
  onDismiss: () => void;
}) {
  const theme = useThemeColors();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);

  async function copy(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    showToast({ message: `${label} copied`, variant: 'success' });
  }

  return (
    <View className="rounded-xl overflow-hidden border border-theme mb-2.5">
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center gap-2 px-3 pt-2.5">
        <View className="w-7 h-7 rounded-lg items-center justify-center bg-surface-2">
          <Icon name="ti-building-bank" size={13} color={theme.textSecondary} />
        </View>
        <Text className="text-xs font-bold text-primary flex-1" numberOfLines={1}>
          {sender}
        </Text>
        {/* Full date+time (with year) — this can be an "all time" scan spanning several years, and the
            original SMS itself carries both; a bare "12 Aug" (no year, no time) silently threw away
            real information the source message had. */}
        <Text className="text-[10px] text-tertiary">{formatDateTime(receivedAt)}</Text>
      </Pressable>
      <Text
        className="text-[10px] text-secondary leading-relaxed px-3 pt-1.5 pb-2"
        numberOfLines={expanded ? undefined : 2}
      >
        {expanded ? redactDigits(body) : body}
      </Text>
      {expanded && (
        <Text className="text-[8.5px] italic text-tertiary px-3 pb-2">
          Digits masked by default — amounts, account &amp; reference numbers
        </Text>
      )}
      <View className="border-t border-theme flex-row gap-1.5 px-2.5 py-2">
        <Pressable
          onPress={() => void copy(redactDigits(body), 'Message (masked)')}
          className="flex-1 flex-row items-center justify-center gap-1 rounded-lg py-1.5"
          style={{ backgroundColor: theme.surfaceSecondary }}
        >
          <Icon name="ti-copy" size={11} color={theme.textSecondary} />
          <Text className="text-[10.5px] font-semibold text-secondary">Copy (masked)</Text>
        </Pressable>
        {expanded && (
          <Pressable
            onPress={() => void copy(body, 'Message (unmasked)')}
            className="flex-1 flex-row items-center justify-center gap-1 rounded-lg py-1.5"
          >
            <Icon name="ti-eye" size={11} color={theme.textTertiary} />
            <Text className="text-[10.5px] font-semibold text-tertiary">Copy unmasked</Text>
          </Pressable>
        )}
        <Pressable onPress={onDismiss} className="flex-1 flex-row items-center justify-center gap-1 rounded-lg py-1.5">
          <Icon name="ti-x" size={11} color={theme.textTertiary} />
          <Text className="text-[10.5px] font-semibold text-tertiary">Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface SenderGroupData {
  sender: string;
  bankLabel: string;
  records: SmsTransactionRecord[];
}

/** Currently-excluded senders (`SmsExcludedSender`, durable — see `useSmsTracking.ts`'s `excludeSender`
 *  doc comment) — a short, always-visible list (not itself collapsed; realistically a handful of
 *  entries) so a mistaken exclusion is one tap away from being undone. */
function ExcludedSendersBox({ senders, onUndo }: { senders: SmsExcludedSender[]; onUndo: (sender: string) => void }) {
  const theme = useThemeColors();
  if (senders.length === 0) return null;
  return (
    <View
      className="rounded-xl border border-dashed mb-3 px-3 py-2.5"
      style={{ borderColor: theme.danger, backgroundColor: tint(theme.danger, 8) }}
    >
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon name="ti-ban" size={12} color={theme.danger} />
        <Text className="text-[10px] font-bold" style={{ color: theme.danger }}>
          Excluded senders ({senders.length}) — never surfaced here again
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {senders.map((s) => (
          <View
            key={s.id}
            className="flex-row items-center gap-1.5 rounded-full border border-theme bg-surface px-2.5 py-1"
          >
            <Text className="text-[9.5px] font-bold text-secondary" style={{ fontFamily: 'monospace' }}>
              {s.sender}
            </Text>
            <Pressable onPress={() => onUndo(s.sender)}>
              <Text className="text-[9.5px] font-bold" style={{ color: theme.info }}>
                Undo
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One sender's whole bucket, collapsed by default (mirrors `bank-import/MatchedBucket.tsx`'s own
 *  "collapsed by default, tap to review" convention) — a real historical scan realistically surfaces
 *  unparsed messages from only a handful of distinct bank sender IDs, each potentially numbering in the
 *  hundreds/thousands, so grouping is what actually makes this screen scannable instead of an
 *  undifferentiated flat list. "Dismiss all" clears every record in the group at once (not just the
 *  ones currently rendered under the per-group cap). */
function SenderGroup({
  group,
  onDismissOne,
  onDismissAll,
  onExcludeSender
}: {
  group: SenderGroupData;
  onDismissOne: (record: SmsTransactionRecord) => void;
  onDismissAll: (records: SmsTransactionRecord[]) => void;
  onExcludeSender: (sender: string) => void;
}) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const visible = group.records.slice(0, RENDER_CAP_PER_GROUP);

  return (
    <View className="rounded-xl border border-theme mb-2.5 overflow-hidden">
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center gap-2 px-3 py-2.5">
        <View className="w-7 h-7 rounded-lg items-center justify-center bg-surface-2">
          <Icon name="ti-building-bank" size={14} color={theme.textSecondary} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold text-primary" numberOfLines={1}>
            {group.sender}
          </Text>
          {!!group.bankLabel && <Text className="text-[10px] text-tertiary">{group.bankLabel}</Text>}
        </View>
        <Text className="text-[10.5px] font-semibold text-tertiary">{group.records.length}</Text>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>

      {expanded && (
        <View className="px-2.5 pb-2.5">
          <View className="flex-row justify-end gap-3 mb-1.5">
            <Pressable onPress={() => onDismissAll(group.records)} className="flex-row items-center gap-1 px-2 py-1.5">
              <Icon name="ti-x" size={11} color={theme.textTertiary} />
              <Text className="text-[10.5px] font-semibold text-tertiary">Dismiss all {group.records.length}</Text>
            </Pressable>
            <Pressable
              onPress={() => onExcludeSender(group.sender)}
              className="flex-row items-center gap-1 px-2 py-1.5"
            >
              <Icon name="ti-ban" size={11} color={theme.danger} />
              <Text className="text-[10.5px] font-semibold" style={{ color: theme.danger }}>
                Exclude sender
              </Text>
            </Pressable>
          </View>
          {visible.map((record) => (
            <MessageCard
              key={record.id}
              sender={record.sender}
              receivedAt={record.receivedAt}
              body={record.rawBody ?? ''}
              onDismiss={() => onDismissOne(record)}
            />
          ))}
          {group.records.length > RENDER_CAP_PER_GROUP && (
            <Text className="text-[10px] text-tertiary text-center mt-1">
              +{group.records.length - RENDER_CAP_PER_GROUP} more from this sender — export all to see everything.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Unparsed Messages (2026-08-15 addition, mockup §2) — most SMS-tracking apps silently drop messages
 * they can't parse; Penny keeps every recognized-bank-sender message that failed to match a template,
 * visible and exportable, per `SmsTransactionRecord`'s own doc comment. Masked-by-default copy/export,
 * with an explicit secondary "unmasked" action.
 *
 * Grouped by sender into collapsed-by-default accordions (2026-08-17 addition) — a real "all time" scan
 * against years of history can surface thousands of unparsed messages from just a handful of bank
 * sender IDs (each one a signal that that sender's template needs fixing), and a flat capped list made
 * it impossible to tell "one sender failing a lot" apart from "many senders failing a little" without
 * exporting everything first. Each group supports dismissing its entire bucket in one action.
 */
export function UnparsedMessagesPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const { showToast } = useToast();
  useDefaultHeaderBack('SmsUnparsedMessages');
  const sms = useSmsTracking();
  const [exporting, setExporting] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(sms.reload);

  const groups = useMemo<SenderGroupData[]>(() => {
    const bySender = new Map<string, SmsTransactionRecord[]>();
    for (const record of sms.unparsed) {
      const arr = bySender.get(record.sender) ?? [];
      arr.push(record);
      bySender.set(record.sender, arr);
    }
    return [...bySender.entries()]
      .map(([sender, records]) => {
        const bankId = records[0]?.bankId;
        return {
          sender,
          bankLabel: bankId ? (BANK_PRESET_LABELS[bankId] ?? bankId) : '',
          records: [...records].sort((a, b) => b.receivedAt - a.receivedAt)
        };
      })
      .sort((a, b) => b.records.length - a.records.length); // biggest/most-affected sender first
  }, [sms.unparsed]);

  async function handleExportAll() {
    if (sms.unparsed.length === 0) return;
    setExporting(true);
    try {
      const content = sms.unparsed
        .map((r) => `${r.sender} · ${new Date(r.receivedAt).toISOString()}\n${redactDigits(r.rawBody ?? '')}\n`)
        .join('\n---\n\n');
      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, 'penny-unparsed-sms.txt');
      file.write(content);
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
      } else {
        showToast({ message: 'Sharing isn’t available on this device.' });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      showToast({ message: `Couldn't export: ${detail}` });
    } finally {
      setExporting(false);
    }
  }

  /** Sequential, not `Promise.all` — `dismissUnparsed`'s underlying `persistRecord` keeps its own
   *  same-tick-consistent `recordsRef` snapshot up to date on each call (read by other resolution
   *  paths' dedup/duplicate checks), which concurrent calls could race on. Group sizes here are bounded
   *  by one sender's real message volume, not an unbounded set, so sequential awaits stay fast enough. */
  async function dismissGroup(records: SmsTransactionRecord[]) {
    for (const record of records) {
      await sms.dismissUnparsed(record);
    }
    showToast({ message: `Dismissed ${records.length} message${records.length === 1 ? '' : 's'}.` });
  }

  /** Durable, sender-wide — see `useSmsTracking.ts`'s `excludeSender` doc comment for exactly how this
   *  differs from `dismissGroup` above (which only clears this batch, not future recurrence). */
  async function handleExcludeSender(sender: string) {
    await sms.excludeSender(sender);
    showToast({ message: `${sender} excluded — it won't show up here again.` });
  }

  const totalCount = sms.unparsed.length;

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        actions={
          <Pressable
            onPress={() => void handleExportAll()}
            disabled={exporting || totalCount === 0}
            className="w-9 h-9 items-center justify-center rounded-lg bg-surface-2"
            style={{ opacity: totalCount === 0 ? 0.4 : 1 }}
            accessibilityLabel="Export all"
          >
            <Icon name="ti-share-2" size={15} color={theme.textSecondary} />
          </Pressable>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <Banner variant="info" className="mb-3">
          {totalCount === 0
            ? "These looked like transactions from banks Penny recognizes, but didn't match a known message format — nothing was recorded from them."
            : `${totalCount} message${totalCount === 1 ? '' : 's'} from ${groups.length} sender${groups.length === 1 ? '' : 's'} looked like transactions from banks Penny recognizes, but didn't match a known message format — nothing was recorded from them.`}
        </Banner>

        <ExcludedSendersBox senders={sms.excludedSenderRecords} onUndo={(sender) => void sms.unexcludeSender(sender)} />

        {totalCount === 0 ? (
          <Text className="text-xs text-tertiary text-center py-8">No unparsed messages right now.</Text>
        ) : (
          <>
            {groups.map((group) => (
              <SenderGroup
                key={group.sender}
                group={group}
                onDismissOne={(record) => void sms.dismissUnparsed(record)}
                onDismissAll={(records) => void dismissGroup(records)}
                onExcludeSender={(sender) => void handleExcludeSender(sender)}
              />
            ))}
            <Text className="text-[9.5px] text-tertiary leading-relaxed mt-3">
              Export shares every message above as a text file — masked by default, with an explicit option to include
              unmasked text via each message&apos;s own &quot;Copy unmasked&quot;.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
