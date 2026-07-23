import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Everything is generated and shared on-device.
 */
export function StoryViewer({ stories, startIndex, onSeen, onClose }: Props) {
  const [storyIdx, setStoryIdx] = useState(startIndex);
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);

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

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') advance();
      else if (e.key === 'ArrowLeft') rewind();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, rewind, onClose]);

  if (!story || !slide) return null;

  const last = slideIdx >= slideCount - 1;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col text-white" style={{ background: story.gradient }}>
      {/* progress segments for the current story */}
      <div className="flex gap-1.5 px-4 pt-4">
        {story.slides.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
          >
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: i < slideIdx ? '100%' : i === slideIdx ? '100%' : '0%',
                transition: i === slideIdx && !paused ? `width ${SLIDE_MS}ms linear` : 'none'
              }}
            />
          </div>
        ))}
      </div>

      {/* header: which story + close */}
      <div className="flex items-center gap-2 px-4 pt-3 relative z-10">
        <span className="text-base" aria-hidden="true">
          {story.emoji}
        </span>
        <span className="text-xs font-semibold opacity-90">{story.label}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto p-1">
          <i className="ti ti-x" style={{ fontSize: 22 }} aria-hidden="true" />
        </button>
      </div>

      {/* tap zones (hold to pause) */}
      <div className="absolute inset-0 flex">
        <button
          type="button"
          aria-label="Previous"
          className="w-1/3"
          onClick={rewind}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />
        <button
          type="button"
          aria-label="Next"
          className="flex-1"
          onClick={advance}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />
      </div>

      {/* slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl font-bold mb-4 leading-tight tabular-nums">{slide.big}</div>
        <p className="text-lg font-medium opacity-95">{slide.caption}</p>
        {slide.sub && <p className="text-sm opacity-75 mt-2 max-w-[300px]">{slide.sub}</p>}
      </div>

      {/* last-slide actions */}
      {last && (story.cta || story.onShare) && (
        <div className="relative z-10 px-6 pb-10 flex flex-col gap-2">
          {story.onShare && (
            <button
              type="button"
              onClick={story.onShare}
              className="w-full py-3 rounded-xl bg-white font-semibold text-sm"
              style={{ color: '#007A4D' }}
            >
              <i className="ti ti-share" style={{ fontSize: 16 }} aria-hidden="true" /> Share
            </button>
          )}
          {story.cta && (
            <button
              type="button"
              onClick={story.cta.onClick}
              className={`w-full py-3 rounded-xl font-semibold text-sm ${story.onShare ? 'bg-white/15 text-white' : 'bg-white'}`}
              style={story.onShare ? undefined : { color: '#007A4D' }}
            >
              {story.cta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
