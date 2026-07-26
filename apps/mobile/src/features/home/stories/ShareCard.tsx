import { forwardRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import type { ShareCardSpec } from './storyTypes';

const CARD_W = 1080;
const CARD_H = 1350;
// Rendered at a fraction of the real 1080x1350 export size so it's a sane on-screen footprint while
// mounted off-screen — react-native-view-shot snapshots the live view's own pixels, so the exported
// PNG is this size, not the original canvas resolution. Good enough for a share-sheet preview image.
const SCALE = 0.28;

/**
 * Mirrors web's `shareStoryImage`, which drew a gradient + title/big-number/lines directly onto a
 * `<canvas>`. RN has no procedural canvas, so instead this renders the exact same visual as a real
 * (offscreen) RN View — StoryViewer mounts one of these hidden off past the right edge of the screen —
 * and `captureAndShareCard` below hands that live view to `react-native-view-shot` to snapshot to a
 * temp PNG, then to `expo-sharing` to open the native share sheet with that file.
 */
export const ShareCard = forwardRef<ViewShotRef, { spec: ShareCardSpec; gradient: readonly [string, string] }>(
  function ShareCard({ spec, gradient }, ref) {
    return (
      <ViewShot ref={ref} options={{ format: 'png', result: 'tmpfile' }}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.4, y: 1 }}
          style={{ width: CARD_W * SCALE, height: CARD_H * SCALE, alignItems: 'center', paddingTop: 70 * SCALE }}
        >
          <Text style={[styles.title, { fontSize: 60 * SCALE }]}>{spec.title}</Text>
          <Text style={[styles.big, { fontSize: 200 * SCALE, marginTop: 90 * SCALE }]}>{spec.big}</Text>
          <View style={{ marginTop: 40 * SCALE, gap: 12 * SCALE }}>
            {spec.lines.map((line, i) => (
              <Text key={i} style={[styles.line, { fontSize: 46 * SCALE }]}>
                {line}
              </Text>
            ))}
          </View>
          <Text style={[styles.footer, { fontSize: 34 * SCALE, bottom: 80 * SCALE }]}>
            Private by design · all on my device
          </Text>
        </LinearGradient>
      </ViewShot>
    );
  }
);

const styles = StyleSheet.create({
  title: { color: '#ffffff', fontWeight: 'bold', textAlign: 'center' },
  big: { color: '#ffffff', fontWeight: 'bold', textAlign: 'center' },
  line: { color: '#ffffff', textAlign: 'center' },
  footer: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', position: 'absolute' }
});
