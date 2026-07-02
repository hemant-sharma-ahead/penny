import { useState } from 'react';
import { Modal, Button, TextInput, SegmentedControl } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { createGroup } from '@/core/groups/groupsService';
import type { GroupHistoryVisibility, GroupType } from '@/core/db/types';
import { useGroupContext } from '@/context/GroupContext';

const TYPES: { value: GroupType; label: string }[] = [
  { value: 'family', label: 'Family' },
  { value: 'trip', label: 'Trip' },
  { value: 'roommates', label: 'Roommates' },
  { value: 'other', label: 'Other' }
];

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
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
      showToast({ message: err instanceof Error ? err.message : 'Could not create the group' });
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Create a group"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || saving} className="flex-1">
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput label="Group name" value={name} onChange={setName} placeholder="e.g. Goa Trip" required autoFocus />
        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">Type</label>
          <SegmentedControl options={TYPES} value={type} onChange={setType} cols={4} />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">History for new members</label>
          <SegmentedControl
            options={[
              { value: 'from_join', label: 'From when they join' },
              { value: 'full', label: 'Full history' }
            ]}
            value={visibility}
            onChange={setVisibility}
            cols={2}
          />
          <p className="text-[11px] text-tertiary mt-1.5">
            {visibility === 'from_join'
              ? 'New members only see expenses added after they join.'
              : 'New members can see the full expense history.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}
