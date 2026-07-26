// Shared types for the Home "stories" (Instagram-style tap-through cards) and a generic on-device
// share-image generator. Everything renders + shares locally — no network, no AI.

export interface StorySlide {
  /** Large hero line — an emoji, a number, or a short value. */
  big: string;
  /** Caption under the hero line. */
  caption: string;
  /** Optional smaller sub-line. */
  sub?: string;
}

export interface Story {
  id: string;
  /** Ring label under the bubble. */
  label: string;
  /** Ring icon (emoji) shown in the bubble. */
  emoji: string;
  /** CSS background for the viewer (and the ring's filled state). */
  gradient: string;
  /** Changes whenever the story's content is fresh, so a seen ring re-lights. */
  freshnessKey: string;
  slides: StorySlide[];
  /** Optional call-to-action shown on the last slide. */
  cta?: { label: string; onClick: () => void };
  /** Optional share action shown on the last slide (generates an image on-device). */
  onShare?: () => void;
}

/** Draw and share (or download) a 1080×1350 story card entirely on-device. */
export async function shareStoryImage(opts: {
  title: string;
  big: string;
  lines: string[];
  filename: string;
}): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, 1350);
  g.addColorStop(0, '#00C47D');
  g.addColorStop(1, '#007A4D');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 60px sans-serif';
  ctx.fillText(opts.title, 540, 260);
  ctx.font = 'bold 200px sans-serif';
  ctx.fillText(opts.big, 540, 620);
  ctx.font = '46px sans-serif';
  opts.lines.forEach((line, i) => ctx.fillText(line, 540, 780 + i * 80));
  ctx.font = '34px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Private by design · all on my device', 540, 1270);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], opts.filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: opts.title });
      return;
    }
  } catch {
    /* user cancelled or share failed — fall through to download */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
}
