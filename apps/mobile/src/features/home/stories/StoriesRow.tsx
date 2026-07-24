import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getJSON, setJSON } from '~/lib/storage';
import { useThemeColors } from '~/theme/useThemeColors';
import { useHomeStories } from './useHomeStories';
import { StoryViewer } from './StoryViewer';
import type { Story } from './storyTypes';

const SEEN_KEY = 'penny_stories_seen';

/** Instagram-style story rings on Home: unseen = gradient ring, seen = muted. Tap to open the viewer.
 *  RN port of apps/web-legacy/src/features/home/stories/StoriesRow.tsx — `localStorage` swapped for
 *  `~/lib/storage`'s AsyncStorage-backed helper (async, so `seen` starts empty and hydrates once on
 *  mount), and the ring's CSS `background: <gradient-string>` swapped for `expo-linear-gradient`. */
export function StoriesRow() {
  const stories = useHomeStories();
  const theme = useThemeColors();
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  // Frozen snapshot of the ordered list + start index while the viewer is open, so marking a story
  // seen (which re-sorts the row underneath) can't shift the viewer's indices mid-session.
  const [viewer, setViewer] = useState<{ list: Story[]; index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getJSON<string[]>(SEEN_KEY).then((stored) => {
      if (!cancelled && stored) setSeen(new Set(stored));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback((story: Story) => {
    setSeen((prev) => {
      if (prev.has(story.freshnessKey)) return prev;
      const next = new Set(prev).add(story.freshnessKey);
      // Keep only keys that still matter (cap the list so it can't grow forever).
      void setJSON(SEEN_KEY, [...next].slice(-50));
      return next;
    });
  }, []);

  // Unseen rings first, so the freshest stories lead. Memoised so the viewer's story list is stable.
  const ordered = useMemo(
    () => [...stories].sort((a, b) => Number(seen.has(a.freshnessKey)) - Number(seen.has(b.freshnessKey))),
    [stories, seen]
  );

  if (stories.length === 0) return null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mb-1">
        <View className="flex-row gap-3.5 px-4">
          {ordered.map((story) => {
            const isSeen = seen.has(story.freshnessKey);
            return (
              <Pressable
                key={story.id}
                onPress={() => setViewer({ list: ordered, index: ordered.indexOf(story) })}
                className="items-center gap-1.5 w-[62px] active:opacity-70"
              >
                {isSeen ? (
                  <View
                    className="w-[58px] h-[58px] rounded-full items-center justify-center p-[2.5px]"
                    style={{ backgroundColor: theme.border }}
                  >
                    <RingBubble story={story} theme={theme} />
                  </View>
                ) : (
                  <LinearGradient
                    colors={story.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.4, y: 1 }}
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 29,
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 2.5
                    }}
                  >
                    <RingBubble story={story} theme={theme} />
                  </LinearGradient>
                )}
                <Text className="text-[10px] leading-tight text-center text-secondary font-medium" numberOfLines={1}>
                  {story.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {viewer && (
        <StoryViewer
          stories={viewer.list}
          startIndex={viewer.index}
          onSeen={markSeen}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

function RingBubble({ story, theme }: { story: Story; theme: ReturnType<typeof useThemeColors> }) {
  return (
    <View
      className="w-full h-full rounded-full items-center justify-center"
      style={{ backgroundColor: theme.surface, borderWidth: 2, borderColor: theme.surfaceTertiary }}
    >
      <Text style={{ fontSize: 23 }}>{story.emoji}</Text>
    </View>
  );
}
