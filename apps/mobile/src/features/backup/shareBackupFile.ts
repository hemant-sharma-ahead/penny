import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

/**
 * Shares an already-exported/-downloaded backup's raw text as a `.penny` file via the platform's share
 * sheet (native) or a browser download (RN Web) — the one place this write-to-temp-then-share dance
 * lives, shared by `AutoBackupCard.tsx`'s "Back up now" on-demand export (This device) and
 * `BackupHistoryModal.tsx`'s per-entry Download action (added for Backup History), so a future change
 * to this flow only has to land once.
 */
export async function shareBackupFile(text: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  // `File.write()` is async (`Promise<void>`) — must be awaited before the share call below reads this
  // same file, or the share sheet can hand off a still-writing/truncated file (found 2026-08-21 in
  // AutoBackupCard's original export flow, when this dance lived only there — see CLAUDE.md's matching
  // reliability rule on always awaiting an async file write before the very next read/share/delete).
  await file.write(text);
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
}
