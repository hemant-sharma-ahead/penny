// Local image helpers — compress a picked receipt photo to a small JPEG data URL
// before it's stored (encrypted) on the transaction. Keeps IndexedDB lean and the
// photo on-device. Browser/DOM-dependent (canvas + FileReader).

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/**
 * Reads an image file and returns a downscaled JPEG data URL (longest edge ≤
 * `maxDim`). Falls back to the original data URL if canvas isn't available.
 */
export async function fileToReceiptDataUrl(file: File, maxDim = 1280, quality = 0.7): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 220_000) return original; // already small
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return original;
  }
}
