import { useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, TextInput, SegmentedControl } from '~/components/ui';
import { useToast } from '~/context/ToastContext';
import { createGroup } from '@/core/groups/groupsService';
import type { GroupHistoryVisibility, GroupType } from '@/core/db/types';
import { useGroupContext } from '~/context/GroupContext';
import { useServerActionError } from './useServerActionError';

const TYPES: { value: GroupType; label: string }[] = [
  { value: 'family', label: 'Family' },
  { value: 'trip', label: 'Trip' },
  { value: 'roommates', label: 'Roommates' },
  { value: 'other', label: 'Other' }
];

/** RN port of apps/web-legacy/src/features/groups/CreateGroupModal.tsx — straightforward form port. */
export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const onError = useServerActionError();
  const { setContext, refresh } = useGroupContext();
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('trip');
  const [visibility, setVisibility] = useState<GroupHistoryVisibility>('from_join');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const group = await createGroup({ name: trimmed, type, historyVisibility: visibility });
      refresh();
      setContext(group.id);
      showToast({ message: `Created “${group.name}”` });
      onClose();
    } catch (err) {
      if (!onError(err, 'Could not create the group')) setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Create a group"
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="ghost" fullWidth onPress={onClose}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth disabled={!name.trim() || saving} loading={saving} onPress={() => void handleCreate()}>
              Create
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        <TextInput label="Group name" value={name} onChange={setName} placeholder="e.g. Goa Trip" required autoFocus />
        <View>
          <Text className="text-xs font-medium text-secondary mb-1.5">Type</Text>
          <SegmentedControl options={TYPES} value={type} onChange={setType} />
        </View>
        <View>
          <Text className="text-xs font-medium text-secondary mb-1.5">History for new members</Text>
          <SegmentedControl
            options={[
              { value: 'from_join' as const, label: 'From when they join' },
              { value: 'full' as const, label: 'Full history' }
            ]}
            value={visibility}
            onChange={setVisibility}
          />
          <Text className="text-[11px] text-tertiary mt-1.5">
            {visibility === 'from_join'
              ? 'New members only see expenses added after they join.'
              : 'New members can see the full expense history.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
