import { useCallback, useMemo, useState } from 'react';
import { useHomeStories } from './useHomeStories';
import { StoryViewer } from './StoryViewer';
import type { Story } from './storyTypes';

const SEEN_KEY = 'penny_stories_seen';

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Instagram-style story rings on Home: unseen = gradient ring, seen = muted. Tap to open the viewer. */
export function StoriesRow() {
  const stories = useHomeStories();
  const [seen, setSeen] = useState<Set<string>>(loadSeen);
  // Frozen snapshot of the ordered list + start index while the viewer is open, so marking a story
  // seen (which re-sorts the row underneath) can't shift the viewer's indices mid-session.
  const [viewer, setViewer] = useState<{ list: Story[]; index: number } | null>(null);

  const markSeen = useCallback((story: Story) => {
    setSeen((prev) => {
      if (prev.has(story.freshnessKey)) return prev;
      const next = new Set(prev).add(story.freshnessKey);
      // Keep only keys that still matter (cap the list so it can't grow forever).
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-50)));
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
      <div className="flex gap-3.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {ordered.map((story) => {
          const isSeen = seen.has(story.freshnessKey);
          return (
            <button
              key={story.id}
              type="button"
              onClick={() => setViewer({ list: ordered, index: ordered.indexOf(story) })}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[62px] active:opacity-70"
            >
              <span
                className="w-[58px] h-[58px] rounded-full grid place-items-center p-[2.5px]"
                style={{ background: isSeen ? 'var(--color-border)' : story.gradient }}
              >
                <span
                  className="w-full h-full rounded-full grid place-items-center text-[23px]"
                  style={{ background: 'var(--color-surface)', border: '2px solid var(--color-surface-3)' }}
                  aria-hidden="true"
                >
                  {story.emoji}
                </span>
              </span>
              <span className="text-[10px] leading-tight text-center text-secondary font-medium truncate w-full">
                {story.label}
              </span>
            </button>
          );
        })}
      </div>

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
