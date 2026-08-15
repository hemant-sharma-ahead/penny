import { useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Banner, PageHeader } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { useToast } from '~/context/ToastContext';
import { redactDigits } from '@/core/sms-import/smsParser';
import { formatDateShort } from '@/lib/date';
import { useSmsTracking } from './useSmsTracking';

/** A real historical scan against a known bank sender could plausibly surface dozens of unparsed
 *  messages — capped per CLAUDE.md's bulk-render rule (first N + "show all"), never an unbounded
 *  `.map()`. */
const RENDER_CAP = 50;

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
        <Text className="text-[10px] text-tertiary">{formatDateShort(receivedAt)}</Text>
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

/**
 * Unparsed Messages (2026-08-15 addition, mockup §2) — most SMS-tracking apps silently drop messages
 * they can't parse; Penny keeps every recognized-bank-sender message that failed to match a template,
 * visible and exportable, per `SmsTransactionRecord`'s own doc comment. Masked-by-default copy/export,
 * with an explicit secondary "unmasked" action, and a per-item Dismiss.
 */
export function UnparsedMessagesPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const { showToast } = useToast();
  useDefaultHeaderBack('SmsUnparsedMessages');
  const sms = useSmsTracking();
  const [exporting, setExporting] = useState(false);

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

  const visible = sms.unparsed.slice(0, RENDER_CAP);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        actions={
          <Pressable
            onPress={() => void handleExportAll()}
            disabled={exporting || sms.unparsed.length === 0}
            className="w-9 h-9 items-center justify-center rounded-lg bg-surface-2"
            style={{ opacity: sms.unparsed.length === 0 ? 0.4 : 1 }}
            accessibilityLabel="Export all"
          >
            <Icon name="ti-share-2" size={15} color={theme.textSecondary} />
          </Pressable>
        }
      />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <Banner variant="info" className="mb-3">
          These looked like transactions from banks Penny recognizes, but didn&apos;t match a known message format —
          nothing was recorded from them.
        </Banner>

        {sms.unparsed.length === 0 ? (
          <Text className="text-xs text-tertiary text-center py-8">No unparsed messages right now.</Text>
        ) : (
          <>
            {visible.map((record) => (
              <MessageCard
                key={record.id}
                sender={record.sender}
                receivedAt={record.receivedAt}
                body={record.rawBody ?? ''}
                onDismiss={() => void sms.dismissUnparsed(record)}
              />
            ))}
            {sms.unparsed.length > RENDER_CAP && (
              <Text className="text-[10px] text-tertiary text-center mt-1">
                +{sms.unparsed.length - RENDER_CAP} more — export all to see everything.
              </Text>
            )}
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
