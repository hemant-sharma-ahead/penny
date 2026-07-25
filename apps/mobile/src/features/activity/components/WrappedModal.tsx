import { forwardRef, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { ActivityLog } from '@/core/db/types';
import { weeklyStats } from '@/core/activity/narrate';
import { Icon } from '~/components/Icon';

interface Props {
  entries: ActivityLog[];
  onClose: () => void;
}

interface Card {
  big: string;
  caption: string;
}

const GRADIENT = ['#00C47D', '#007A4D'] as const;
const SHARE_CARD_W = 1080;
const SHARE_CARD_H = 1350;
const SHARE_SCALE = 0.28; // rendered small on-screen (offscreen), react-native-view-shot snaps its real pixels

/**
 * RN port of apps/web-legacy/src/features/activity/components/WrappedModal.tsx's hand-rolled `fixed
 * inset-0 z-[90]` full-screen "wrapped"-style overlay + `<canvas>`-drawn share image.
 *
 * Neither the shared `components/ui` `Modal` (a centered dialog, not a full-bleed story presentation —
 * see its own props) nor forcing this into it was the right fit. Home's Stories feature
 * (`apps/mobile/src/features/home/stories/StoryViewer.tsx`) already solved this *exact* shape — a
 * full-screen, tap-through, gradient story card with a share action — so this follows that established
 * pattern directly (RN's own full-screen `Modal`, tap zones, progress segments, `react-native-view-shot`
 * + `expo-sharing` for the share flow) rather than reusing `StoryViewer`/`ShareCard` components
 * themselves cross-feature (this migration's `no cross-feature import` convention — CLAUDE.md's
 * architecture rule 3 for web features — extends here by the same spirit even though it isn't
 * ESLint-enforced for `apps/mobile/src/features/*` yet). The offscreen share-card template below is a
 * small, self-contained duplicate of `ShareCard.tsx`'s technique, not an import of it.
 */
export function WrappedModal({ entries, onClose }: Props) {
  const stats = weeklyStats(entries);
  const [idx, setIdx] = useState(0);
  const shareRef = useRef<ViewShotRef>(null);

  const cards: Card[] = stats
    ? [
        { big: '✨', caption: 'Your week on Penny' },
        { big: String(stats.total), caption: 'changes this week' },
        { big: stats.busiestDay ?? '—', caption: 'your busiest day' },
        { big: `${stats.added}·${stats.removed}`, caption: 'added · removed' },
        { big: '🔒', caption: 'All private. All on your device.' }
      ]
    : [{ big: '🌱', caption: 'Track a few things and your week shows up here.' }];

  const last = idx >= cards.length - 1;
  const card = cards[idx] ?? cards[0];

  function next() {
    if (last) onClose();
    else setIdx((i) => i + 1);
  }

  async function handleShare() {
    try {
      const uri = await shareRef.current?.capture?.();
      if (!uri) return;
      const available = await Sharing.isAvailableAsync();
      if (!available) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'My week on Penny', UTI: 'public.png' });
    } catch {
      /* user cancelled or share failed — no fallback needed, same as Home Stories' captureAndShareCard */
    }
  }

  if (!card) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={GRADIENT} style={{ flex: 1 }}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          {/* progress segments */}
          <View className="flex-row gap-1.5 px-4 pt-4">
            {cards.map((_, i) => (
              <View key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}>
                <View className="h-full rounded-full bg-white" style={{ width: i <= idx ? '100%' : '0%' }} />
              </View>
            ))}
          </View>

          <Pressable onPress={onClose} accessibilityLabel="Close" className="absolute right-4 top-6 z-10 p-1">
            <Icon name="ti-x" size={22} color="#ffffff" />
          </Pressable>

          {/* tap zones */}
          <View className="absolute inset-0 flex-row">
            <Pressable
              accessibilityLabel="Previous"
              className="w-1/3"
              onPress={() => setIdx((i) => Math.max(0, i - 1))}
            />
            <Pressable accessibilityLabel="Next" className="flex-1" onPress={next} />
          </View>

          {/* card content */}
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-6xl font-bold mb-4 text-white text-center">{card.big}</Text>
            <Text className="text-lg font-medium text-white text-center" style={{ opacity: 0.95 }}>
              {card.caption}
            </Text>
          </View>

          {last && stats && (
            <View className="px-6 pb-10 gap-2 relative z-10">
              <Pressable
                onPress={() => void handleShare()}
                className="py-3 rounded-xl bg-white items-center flex-row justify-center gap-1.5"
              >
                <Icon name="ti-share" size={16} color="#007A4D" />
                <Text className="font-semibold text-sm" style={{ color: '#007A4D' }}>
                  Share my week
                </Text>
              </Pressable>
              <Pressable onPress={onClose} className="py-2 items-center">
                <Text className="text-sm font-medium text-white" style={{ opacity: 0.9 }}>
                  Done
                </Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>

      {/* offscreen share-card template — mounted (not just styled invisible) so ViewShot can capture real
          pixels, positioned far past the screen edge so it's never visible to the user. */}
      {stats && (
        <View style={{ position: 'absolute', top: 0, left: -3000 }} pointerEvents="none">
          <ShareCard
            ref={shareRef}
            big={String(stats.total)}
            lines={[`Busiest day · ${stats.busiestDay ?? '—'}`, `${stats.added} added · ${stats.removed} removed`]}
          />
        </View>
      )}
    </Modal>
  );
}

const ShareCard = forwardRef<ViewShotRef, { big: string; lines: string[] }>(function ShareCard({ big, lines }, ref) {
  return (
    <ViewShot ref={ref} options={{ format: 'png', result: 'tmpfile' }}>
      <LinearGradient
        colors={GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={{
          width: SHARE_CARD_W * SHARE_SCALE,
          height: SHARE_CARD_H * SHARE_SCALE,
          alignItems: 'center',
          paddingTop: 70 * SHARE_SCALE
        }}
      >
        <Text style={[styles.title, { fontSize: 60 * SHARE_SCALE }]}>My week on Penny</Text>
        <Text style={[styles.big, { fontSize: 200 * SHARE_SCALE, marginTop: 90 * SHARE_SCALE }]}>{big}</Text>
        <View style={{ marginTop: 40 * SHARE_SCALE, gap: 12 * SHARE_SCALE }}>
          {lines.map((line, i) => (
            <Text key={i} style={[styles.line, { fontSize: 46 * SHARE_SCALE }]}>
              {line}
            </Text>
          ))}
        </View>
        <Text style={[styles.footer, { fontSize: 34 * SHARE_SCALE, bottom: 80 * SHARE_SCALE }]}>
          Private by design · all on my device
        </Text>
      </LinearGradient>
    </ViewShot>
  );
});

const styles = StyleSheet.create({
  title: { color: '#ffffff', fontWeight: 'bold', textAlign: 'center' },
  big: { color: '#ffffff', fontWeight: 'bold', textAlign: 'center' },
  line: { color: '#ffffff', textAlign: 'center' },
  footer: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', position: 'absolute' }
});
