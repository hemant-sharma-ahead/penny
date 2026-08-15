import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, TextInput } from '~/components/ui';
import type { Hashtag } from '@/core/db/types';

interface Props {
  hashtags: Hashtag[];
  count: number;
  onApply: (tag: string) => Promise<void>;
  onClose: () => void;
}

/** Normalizes the same way `ExpenseForm.tsx`'s own `parseTags()` does — lowercase, no leading `#` — so a
 *  tag added here lands in `Expense.hashtags` in exactly the storage form every other entry point uses. */
function normalizeTag(raw: string): string {
  return raw.replace(/^#/, '').trim().toLowerCase();
}

/**
 * Bulk-add ONE hashtag to every selected transaction (2026-08-16, real user report: "assigning bulk tag
 * to the selected ones should also be there" — bulk categorize/account-pay/delete already existed).
 *
 * Deliberately additive-only, never a replace — every selected transaction keeps whatever tags it already
 * had; this only ever adds one more. Reuses `ExpenseForm.tsx`'s "Frequent" tag-chip pattern (top-5 by
 * usage) rather than a bare text field, but is single-selection (tapping a chip/suggestion SETS the input,
 * it doesn't append) since this modal's whole job is picking exactly one tag to apply in bulk — unlike
 * the entry form's space-separated multi-tag input, there's no multi-tag list to build here.
 */
export function BulkHashtagModal({ hashtags, count, onApply, onClose }: Props) {
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = normalizeTag(tagInput);

  // Top-5 by usage — same "always visible, no typing required" shortcut as the entry form's Frequent row.
  const frequentTags = useMemo(() => [...hashtags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5), [hashtags]);

  // Narrows as the user types, same startsWith match the entry form's own tag-suggestion row uses.
  const suggestions = useMemo(
    () =>
      normalized.length > 0
        ? hashtags.filter((h) => h.name.startsWith(normalized) && h.name !== normalized).slice(0, 5)
        : [],
    [hashtags, normalized]
  );

  async function handleApply() {
    if (!normalized) return;
    setBusy(true);
    try {
      await onApply(normalized);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Add a tag"
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose} disabled={busy}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth disabled={!normalized} loading={busy} onPress={() => void handleApply()}>
              Apply
            </Button>
          </View>
        </View>
      }
    >
      <Text className="text-sm text-secondary">
        Adds #{normalized || '…'} to {count} transaction{count === 1 ? '' : 's'} — added to each one's existing tags,
        never replaces them.
      </Text>

      <TextInput placeholder="Search or create a tag" value={tagInput} onChange={setTagInput} />

      {frequentTags.length > 0 && (
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1">Frequent</Text>
          <View className="flex-row flex-wrap gap-1">
            {frequentTags.map((h) => (
              <Button key={h.id} variant="secondary" size="sm" onPress={() => setTagInput(h.name)}>
                #{h.name}
              </Button>
            ))}
          </View>
        </View>
      )}

      {suggestions.length > 0 && (
        <View className="flex-row flex-wrap gap-1">
          {suggestions.map((s) => (
            <Button key={s.id} variant="secondary" size="sm" onPress={() => setTagInput(s.name)}>
              #{s.name}
            </Button>
          ))}
        </View>
      )}
    </Modal>
  );
}
