import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Pressable, Animated, Easing, Text } from 'react-native';
import type { ViewShotRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '~/components/Icon';
import { ShareCard } from './ShareCard';
import { captureAndShareCard } from './shareStoryImage';
import type { Story } from './storyTypes';

interface Props {
  stories: Story[];
  startIndex: number;
  /** Called once per story when it first appears, to mark its ring as seen. */
  onSeen: (story: Story) => void;
  onClose: () => void;
}

const SLIDE_MS = 4500;

/**
 * Full-screen, Instagram-style tap-through viewer for the Home stories. Segmented progress bars for
 * the current story, tap left/right to step, auto-advance, and seamless cross-story progression.
 * RN port of apps/web-legacy/src/features/home/stories/StoryViewer.tsx — dropped the `keydown`
 * Escape/Arrow-key listener entirely (no RN equivalent; the tap zones already give the same
 * prev/next/close affordance touch-first, matching the "sub-page back button dropped" precedent used
 * elsewhere in this port), and swapped the CSS `width`-transition progress fill for an `Animated.Value`
 * driven the same way: reset to 0 on every slide change, animate to 1 over `SLIDE_MS` while unpaused,
 * frozen in place (not reset) while paused — same approximation web's CSS pause/resume already made.
 */
export function StoryViewer({ stories, startIndex, onSeen, onClose }: Props) {
  const [storyIdx, setStoryIdx] = useState(startIndex);
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const shareRef = useRef<ViewShotRef>(null);

  const story = stories[storyIdx];
  const slide = story?.slides[slideIdx];
  const slideCount = story?.slides.length ?? 0;

  // Mark each story seen as it appears. Read latest props via a ref (updated in an effect, never
  // during render) so this fires once per story index, not on every parent re-render.
  const latest = useRef({ stories, onSeen });
  useEffect(() => {
    latest.current = { stories, onSeen };
  });
  useEffect(() => {
    const s = latest.current.stories[storyIdx];
    if (s) latest.current.onSeen(s);
  }, [storyIdx]);

  const advance = useCallback(() => {
    setSlideIdx((si) => {
      if (si < slideCount - 1) return si + 1;
      // End of this story → next story, or close.
      setStoryIdx((sti) => {
        if (sti < stories.length - 1) return sti + 1;
        onClose();
        return sti;
      });
      return 0;
    });
  }, [slideCount, stories.length, onClose]);

  const rewind = useCallback(() => {
    setSlideIdx((si) => {
      if (si > 0) return si - 1;
      setStoryIdx((sti) => Math.max(0, sti - 1));
      return 0;
    });
  }, []);

  // Auto-advance timer (paused while the user holds the screen).
  useEffect(() => {
    if (paused || !story) return;
    const t = setTimeout(advance, SLIDE_MS);
    return () => clearTimeout(t);
  }, [storyIdx, slideIdx, paused, story, advance]);

  // Progress bar fill: fresh 0 on every slide change, animate to 1 over SLIDE_MS while unpaused.
  useEffect(() => {
    progress.setValue(0);
  }, [storyIdx, slideIdx, progress]);

  useEffect(() => {
    if (paused || !story) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.linear,
      useNativeDriver: false
    });
    anim.start();
    return () => anim.stop();
  }, [storyIdx, slideIdx, paused, story, progress]);

  if (!story || !slide) return null;

  const last = slideIdx >= slideCount - 1;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={story.gradient} style={{ flex: 1 }}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          {/* progress segments for the current story */}
          <View className="flex-row gap-1.5 px-4 pt-2">
            {story.slides.map((_, i) => (
              <View
                key={i}
                className="h-1 flex-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
              >
                <Animated.View
                  className="h-full rounded-full bg-white"
                  style={{
                    width:
                      i < slideIdx
                        ? '100%'
                        : i === slideIdx
                          ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                          : '0%'
                  }}
                />
              </View>
            ))}
          </View>

          {/* tap zones (hold to pause) — rendered before the header/actions so their Pressables win
              hit-testing over this one within their own bounds, matching web's z-index stacking */}
          <View className="absolute inset-0 flex-row">
            <Pressable
              accessibilityLabel="Previous"
              className="w-1/3"
              onPress={rewind}
              onPressIn={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
            />
            <Pressable
              accessibilityLabel="Next"
              className="flex-1"
              onPress={advance}
              onPressIn={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
            />
          </View>

          {/* header: which story + close */}
          <View className="flex-row items-center gap-2 px-4 pt-3">
            <Text style={{ fontSize: 16 }}>{story.emoji}</Text>
            <Text className="text-xs font-semibold text-white opacity-90">{story.label}</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" className="ml-auto p-1">
              <Icon name="ti-x" size={22} color="#ffffff" />
            </Pressable>
          </View>

          {/* slide content */}
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-5xl font-bold mb-4 text-white text-center">{slide.big}</Text>
            <Text className="text-lg font-medium text-white text-center" style={{ opacity: 0.95 }}>
              {slide.caption}
            </Text>
            {slide.sub && (
              <Text className="text-sm text-white text-center mt-2 max-w-[300px]" style={{ opacity: 0.75 }}>
                {slide.sub}
              </Text>
            )}
          </View>

          {/* last-slide actions */}
          {last && (story.cta || story.share) && (
            <View className="px-6 pb-6 gap-2">
              {story.share && (
                <Pressable
                  onPress={() => story.share && void captureAndShareCard(shareRef, story.share.title)}
                  className="w-full py-3 rounded-xl bg-white items-center flex-row justify-center gap-1.5"
                >
                  <Icon name="ti-share" size={16} color="#007A4D" />
                  <Text className="font-semibold text-sm" style={{ color: '#007A4D' }}>
                    Share
                  </Text>
                </Pressable>
              )}
              {story.cta && (
                <Pressable
                  onPress={story.cta.onClick}
                  className={`w-full py-3 rounded-xl items-center ${story.share ? 'bg-white/15' : 'bg-white'}`}
                >
                  <Text
                    className="font-semibold text-sm"
                    style={story.share ? { color: '#ffffff' } : { color: '#007A4D' }}
                  >
                    {story.cta.label}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>

      {/* offscreen share-card template: mounted (not just styled invisible) so ViewShot can capture
          real pixels, positioned far past the left edge so it's never visible to the user */}
      {story.share && (
        <View style={{ position: 'absolute', top: 0, left: -3000 }} pointerEvents="none">
          <ShareCard ref={shareRef} spec={story.share} gradient={story.gradient} />
        </View>
      )}
    </Modal>
  );
}
