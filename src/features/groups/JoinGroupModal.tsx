import { useState } from 'react';
import { Modal, Button, TextInput } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { parseJoinSecret, redeemInvite, syncGroupKeys } from '@/core/groups/groupsService';
import { useGroupContext } from '@/context/GroupContext';

export function JoinGroupModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { setContext, refresh } = useGroupContext();
  const [link, setLink] = useState('');
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    const secret = parseJoinSecret(link.trim());
    if (!secret || joining) return;
    setJoining(true);
    try {
      const { groupId, awaitingKey } = await redeemInvite(secret);
      // Best-effort: an admin may have already granted the key.
      if (awaitingKey) await syncGroupKeys(groupId).catch(() => undefined);
      refresh();
      setContext(groupId);
      showToast({ message: awaitingKey ? 'Joined — waiting for the group key' : 'Joined the group' });
      onClose();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Could not join — check the invite link' });
      setJoining(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Join a group"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleJoin} disabled={!link.trim() || joining} className="flex-1">
            {joining ? 'Joining…' : 'Join'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <TextInput
          label="Invite link"
          value={link}
          onChange={setLink}
          placeholder="Paste the invite link or code"
          required
          autoFocus
        />
        <p className="text-[11px] text-tertiary">
          The group name and expenses stay hidden until a member grants your device the encryption key.
        </p>
      </div>
    </Modal>
  );
}
