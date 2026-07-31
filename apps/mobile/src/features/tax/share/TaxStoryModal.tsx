import { useRef, useState } from 'react';
import { Modal, View, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ViewShotRef } from 'react-native-view-shot';
import { Icon } from '~/components/Icon';
import { ShareCard } from '~/features/home/stories/ShareCard';
import { captureAndShareCard } from '~/features/home/stories/shareStoryImage';
import { formatCurrency, formatPercent } from '@/lib/formatters';

export interface TaxStoryData {
  fyLabel: string;
  gross: number;
  consumed: number;
  totalTax: number; // direct + indirect
  directTax: number;
  indirectTax: number;
  taxPctOfConsumed: number;
  savingsRate: number;
}

interface Card {
  big: string;
  caption: string;
}

const GRADIENT = ['#00C47D', '#007A4D'] as const;

/**
 * RN port of apps/web-react/src/features/tax/share/TaxStoryModal.tsx. Web draws the shareable image
 * directly onto a `<canvas>` and shares via `navigator.share`; RN has no procedural canvas, so this
 * reuses Home Stories' exact solution instead — an offscreen `ShareCard` (a real RN `View`) captured by
 * `react-native-view-shot` and handed to `expo-sharing`'s native share sheet (`captureAndShareCard`,
 * `~/features/home/stories/shareStoryImage.ts`). The tap-through card viewer itself is a lighter,
 * purpose-built version of `StoryViewer` (fixed 5-card script, no auto-advance/seen-tracking needed
 * for a single one-off share flow).
 */
export function TaxStoryModal({ data, onClose }: { data: TaxStoryData; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const shareRef = useRef<ViewShotRef>(null);

  const cards: Card[] = [
    { big: '🧾', caption: `Your tax story · ${data.fyLabel}` },
    { big: formatCurrency(Math.round(data.gross)), caption: 'you earned' },
    {
      big: formatCurrency(Math.round(data.totalTax)),
      caption: `paid in tax — ${formatPercent(data.taxPctOfConsumed)} of what you didn't save`
    },
    { big: `${formatPercent(data.savingsRate)}`, caption: 'of your income, saved & invested' },
    { big: '🔒', caption: 'All private. All on your device.' }
  ];

  const last = idx >= cards.length - 1;
  const card = cards[idx] ?? cards[0];
  if (!card) return null;

  const next = () => (last ? onClose() : setIdx((i) => i + 1));

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={{ flex: 1 }}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View className="flex-row gap-1.5 px-4 pt-4">
            {cards.map((_, i) => (
              <View
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{ backgroundColor: i <= idx ? '#fff' : 'rgba(255,255,255,0.35)' }}
              />
            ))}
          </View>

          <Pressable onPress={onClose} accessibilityLabel="Close" className="absolute top-3.5 right-4 z-10 p-1">
            <Icon name="ti-x" size={22} color="#ffffff" />
          </Pressable>

          <View className="absolute inset-0 flex-row">
            <Pressable
              accessibilityLabel="Previous"
              className="w-1/3"
              onPress={() => setIdx((i) => Math.max(0, i - 1))}
            />
            <Pressable accessibilityLabel="Next" className="flex-1" onPress={next} />
          </View>

          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-5xl font-bold mb-4 text-white text-center tabular-nums">{card.big}</Text>
            <Text className="text-lg font-medium text-white text-center" style={{ opacity: 0.95 }}>
              {card.caption}
            </Text>
          </View>

          {last && (
            <View className="px-6 pb-10">
              <Pressable
                onPress={() => void captureAndShareCard(shareRef, 'My tax story')}
                className="w-full py-3 rounded-xl bg-white items-center flex-row justify-center gap-1.5"
              >
                <Icon name="ti-share" size={16} color="#007A4D" />
                <Text className="font-semibold text-sm" style={{ color: '#007A4D' }}>
                  Share my tax story
                </Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>

      <View style={{ position: 'absolute', top: 0, left: -3000 }} pointerEvents="none">
        <ShareCard
          ref={shareRef}
          gradient={GRADIENT}
          spec={{
            title: 'My tax story',
            big: formatCurrency(Math.round(data.totalTax)),
            lines: [
              'paid in tax',
              `${formatPercent(data.taxPctOfConsumed)} of what I didn't save`,
              `Direct ${formatCurrency(Math.round(data.directTax))}`,
              `Indirect ${formatCurrency(Math.round(data.indirectTax))}`,
              `Saved ${formatPercent(data.savingsRate)} of income`
            ],
            filename: 'penny-tax-story.png'
          }}
        />
      </View>
    </Modal>
  );
}
