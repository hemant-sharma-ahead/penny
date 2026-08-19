import { useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, TextInput } from '~/components/ui';
import { useToast } from '~/context/ToastContext';
import { parseJoinSecret, redeemInvite, syncGroupKeys } from '@/core/groups/groupsService';
import { useGroupContext } from '~/context/GroupContext';
import { useServerActionError } from '~/hooks/useServerActionError';

/** RN port of apps/web-react/src/features/groups/JoinGroupModal.tsx — straightforward form port. */
export function JoinGroupModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const onError = useServerActionError();
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
      if (!onError(err, 'Could not join — check the invite link')) setJoining(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Join a group"
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="ghost" fullWidth onPress={onClose}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth disabled={!link.trim() || joining} loading={joining} onPress={() => void handleJoin()}>
              Join
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-2">
        <TextInput
          label="Invite link"
          value={link}
          onChange={setLink}
          placeholder="Paste the invite link or code"
          required
          autoFocus
        />
        <Text className="text-[11px] text-tertiary">
          The group name and expenses stay hidden until a member grants your device the encryption key.
        </Text>
      </View>
    </Modal>
  );
}
