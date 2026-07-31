import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Mobile-only equivalent of packages/core/src/lib/image.ts's `fileToReceiptDataUrl` — not a `.native.ts`
 * sibling, since the input is fundamentally different (a picker/camera URI here, a browser `File` there;
 * there's no shared call site to keep signature-compatible). Wraps expo-image-picker (camera + library,
 * replacing web's `<input type="file">`) and expo-image-manipulator (RN's canvas-downscale equivalent)
 * into one call that returns the same shape web stores: a downscaled JPEG data URL.
 */

const MAX_DIM = 1280;
const QUALITY = 0.7;

async function compressToReceiptDataUrl(uri: string, width: number, height: number): Promise<string> {
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const actions =
    scale < 1 ? [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }] : [];
  const result = await manipulateAsync(uri, actions, { compress: QUALITY, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('image compression produced no data');
  return `data:image/jpeg;base64,${result.base64}`;
}

/** Launches the camera, returns a downscaled JPEG data URL, or `null` if cancelled/denied. */
export async function captureReceiptPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return compressToReceiptDataUrl(asset.uri, asset.width, asset.height);
}

/** Launches the photo library, returns a downscaled JPEG data URL, or `null` if cancelled/denied. */
export async function pickReceiptPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return compressToReceiptDataUrl(asset.uri, asset.width, asset.height);
}
