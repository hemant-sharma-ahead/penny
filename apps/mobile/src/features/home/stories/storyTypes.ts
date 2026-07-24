// Shared types for the Home "stories" (Instagram-style tap-through cards). RN port of
// apps/web-legacy/src/features/home/stories/storyTypes.ts — the share-image generator moved to
// ShareCard.tsx since it now needs to render a real (offscreen) RN View for react-native-view-shot to
// snapshot, rather than draw procedurally onto a <canvas> (see ShareCard.tsx's top comment for why).

export interface StorySlide {
  /** Large hero line — an emoji, a number, or a short value. */
  big: string;
  /** Caption under the hero line. */
  caption: string;
  /** Optional smaller sub-line. */
  sub?: string;
}

/** Content for the on-device share card image (rendered + captured by ShareCard.tsx). */
export interface ShareCardSpec {
  title: string;
  big: string;
  lines: string[];
  filename: string;
}

export interface Story {
  id: string;
  /** Ring label under the bubble. */
  label: string;
  /** Ring icon (emoji) shown in the bubble. */
  emoji: string;
  /** Two-stop gradient for the viewer background (and the ring's filled state) — a [start, end] hex
   *  pair rather than a CSS `linear-gradient(...)` string, since RN has no CSS gradient syntax. */
  gradient: readonly [string, string];
  /** Changes whenever the story's content is fresh, so a seen ring re-lights. */
  freshnessKey: string;
  slides: StorySlide[];
  /** Optional call-to-action shown on the last slide. */
  cta?: { label: string; onClick: () => void };
  /** Optional share card shown on the last slide (generates + shares an image on-device). */
  share?: ShareCardSpec;
}
