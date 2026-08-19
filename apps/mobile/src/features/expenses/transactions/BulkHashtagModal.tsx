import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, TextInput, SegmentedControl } from '~/components/ui';
import type { Hashtag } from '@/core/db/types';

type Mode = 'add' | 'remove';

interface Props {
  hashtags: Hashtag[];
  /** Union of tag names actually present across the currently-selected transactions — Remove mode's
   *  only source of chips (no free-text entry there); computed by the caller from the selected
   *  `Expense[]`, not this modal, since it doesn't otherwise know which transactions are selected. */
  selectedTags: string[];
  count: number;
  onApplyAdd: (tag: string) => Promise<void>;
  onApplyRemove: (tag: string) => Promise<void>;
  onClose: () => void;
}

/** Normalizes the same way `ExpenseForm.tsx`'s own `parseTags()` does — lowercase, no leading `#` — so a
 *  tag added here lands in `Expense.hashtags` in exactly the storage form every other entry point uses. */
function normalizeTag(raw: string): string {
  return raw.replace(/^#/, '').trim().toLowerCase();
}

/**
 * Bulk-apply ONE hashtag change to every selected transaction — either add it to all of them
 * (2026-08-16, real user report: "assigning bulk tag to the selected ones should also be there") or
 * remove it from whichever of them carry it (2026-08-18, real user report: only bulk-add existed).
 *
 * Add mode is additive-only, never a replace — every selected transaction keeps whatever tags it
 * already had, this only ever adds one more (free-text entry + the entry form's "Frequent"/suggestion
 * chip pattern, top-5 by usage). Remove mode has no free-text entry at all — deliberately: a tag that
 * isn't on any selected transaction has nothing to remove, so the only choices offered are chips built
 * from `selectedTags` (the union of tags actually present across the current selection). Either way
 * this is single-selection (tapping a chip/suggestion SETS the pending tag, it doesn't append) since
 * each run only ever applies one tag change in bulk.
 */
export function BulkHashtagModal({ hashtags, selectedTags, count, onApplyAdd, onApplyRemove, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('add');
  const [tagInput, setTagInput] = useState('');
  const [removeTag, setRemoveTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function changeMode(next: Mode) {
    setMode(next);
    setTagInput('');
    setRemoveTag(null);
  }

  const normalizedAdd = normalizeTag(tagInput);
  const pendingTag = mode === 'add' ? normalizedAdd : (removeTag ?? '');

  // Top-5 by usage — same "always visible, no typing required" shortcut as the entry form's Frequent row.
  const frequentTags = useMemo(() => [...hashtags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5), [hashtags]);

  // Narrows as the user types, same startsWith match the entry form's own tag-suggestion row uses.
  const suggestions = useMemo(
    () =>
      normalizedAdd.length > 0
        ? hashtags.filter((h) => h.name.startsWith(normalizedAdd) && h.name !== normalizedAdd).slice(0, 5)
        : [],
    [hashtags, normalizedAdd]
  );

  async function handleApply() {
    if (!pendingTag) return;
    setBusy(true);
    try {
      if (mode === 'add') await onApplyAdd(pendingTag);
      else await onApplyRemove(pendingTag);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={mode === 'add' ? 'Add a tag' : 'Remove a tag'}
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose} disabled={busy}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth disabled={!pendingTag} loading={busy} onPress={() => void handleApply()}>
              Apply
            </Button>
          </View>
        </View>
      }
    >
      <SegmentedControl<Mode>
        options={[
          { value: 'add', label: 'Add' },
          { value: 'remove', label: 'Remove' }
        ]}
        value={mode}
        onChange={changeMode}
      />

      {mode === 'add' ? (
        <>
          <Text className="text-sm text-secondary">
            Adds #{normalizedAdd || '…'} to {count} transaction{count === 1 ? '' : 's'} — added to each one's existing
            tags, never replaces them.
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
        </>
      ) : (
        <>
          <Text className="text-sm text-secondary">
            {removeTag
              ? `Removes #${removeTag} from whichever of the ${count} selected transaction${count === 1 ? '' : 's'} carry it — leaves the rest of each one's tags untouched.`
              : `Pick a tag to remove from the ${count} selected transaction${count === 1 ? '' : 's'}.`}
          </Text>

          {selectedTags.length > 0 ? (
            <View className="flex-row flex-wrap gap-1">
              {selectedTags.map((tag) => (
                <Button
                  key={tag}
                  variant={removeTag === tag ? 'primary' : 'secondary'}
                  size="sm"
                  onPress={() => setRemoveTag(tag)}
                >
                  #{tag}
                </Button>
              ))}
            </View>
          ) : (
            <Text className="text-xs text-tertiary">None of the selected transactions have any tags yet.</Text>
          )}
        </>
      )}
    </Modal>
  );
}
