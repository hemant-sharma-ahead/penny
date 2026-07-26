import { useEffect, useState } from 'react';
import { View, Pressable, Share, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal, Button, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { profileRepo, groupMembersRepo } from '@/core/db/repositories';
import {
  buildJoinLink,
  closeGroup,
  createInvite,
  leaveGroup,
  reopenGroup,
  removeMemberAndRotate,
  setMemberRole
} from '@/core/groups/groupsService';
import type { Group, GroupMember } from '@/core/db/types';
import { useServerActionError } from './useServerActionError';

/**
 * RN port of apps/web-react/src/features/groups/GroupMembersModal.tsx. The one file in this module with
 * real native-API swaps: `navigator.clipboard.writeText(link)` → `expo-clipboard`'s
 * `Clipboard.setStringAsync(link)`; `navigator.share({ title, url })` → RN's built-in `Share.share({
 * message, url })` — same try/fallback-to-clipboard structure as web.
 */
export function GroupMembersModal({
  group,
  onClose,
  onChanged
}: {
  group: Group;
  onClose: () => void;
  onChanged: () => void;
}) {
  const theme = useThemeColors();
  const { showToast } = useToast();
  const onError = useServerActionError();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [myId, setMyId] = useState<string | undefined>();
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const reload = () =>
    Promise.all([groupMembersRepo.getAll(), profileRepo.getAll()]).then(([all, profile]) => {
      setMembers(all.filter((m) => m.groupId === group.id && m.status === 'active'));
      setMyId(profile[0]?.userId);
    });

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  const myRole = members.find((m) => m.userId === myId)?.role ?? 'member';
  const canManage = myRole === 'owner' || myRole === 'admin';
  const closed = group.status === 'closed';

  async function run<T>(fn: () => Promise<T>, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      showToast({ message: ok });
      await reload();
      onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite() {
    await run(async () => {
      const { secret } = await createInvite(group.id, { role: 'member' });
      const link = buildJoinLink(secret);
      setInviteLink(link);
      await Clipboard.setStringAsync(link).catch(() => undefined);
    }, 'Invite link created & copied');
  }

  async function handleShare() {
    try {
      await Share.share({ message: `Join ${group.name || 'my group'} on Penny`, url: inviteLink });
    } catch {
      await Clipboard.setStringAsync(inviteLink).catch(() => undefined);
    }
  }

  return (
    <Modal onClose={onClose} title={group.name || 'Group'} scrollable>
      <View className="gap-4">
        {/* Members */}
        <View>
          <Text className="text-xs font-medium text-secondary mb-1.5">Members · {members.length}</Text>
          <View className="bg-surface border border-theme rounded-xl overflow-hidden">
            {members.map((m, i) => (
              <View
                key={m.id}
                className="flex-row items-center gap-3 px-3 py-2.5"
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.border } : undefined}
              >
                <View className="w-7 h-7 rounded-full bg-surface-2 items-center justify-center">
                  <Text className="text-xs font-semibold text-secondary">
                    {(m.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="flex-1 text-sm text-primary" numberOfLines={1}>
                  {m.userId === myId ? 'You' : m.displayName}
                  <Text className="text-[11px] text-tertiary"> · {m.role}</Text>
                </Text>
                {canManage && m.userId !== myId && m.role !== 'owner' && (
                  <>
                    <Pressable
                      onPress={() =>
                        void run(
                          () => setMemberRole(group.id, m.userId, m.role === 'admin' ? 'member' : 'admin'),
                          'Role updated'
                        )
                      }
                    >
                      <Text className="text-[11px] font-medium" style={{ color: theme.primary }}>
                        {m.role === 'admin' ? 'Make member' : 'Make admin'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Remove member"
                      onPress={() =>
                        void run(() => removeMemberAndRotate(group.id, m.userId), 'Member removed · key rotated')
                      }
                    >
                      <Icon name="ti-user-minus" size={16} color={theme.textTertiary} />
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Invite */}
        {canManage && !closed && (
          <View>
            <Button variant="ghost" fullWidth icon="ti-user-plus" disabled={busy} onPress={() => void handleInvite()}>
              Create invite link
            </Button>
            {inviteLink.length > 0 && (
              <View className="mt-2 gap-2">
                <View className="bg-surface-2 rounded-lg px-3 py-2">
                  <Text className="text-[11px] text-secondary">{inviteLink}</Text>
                  <Text className="text-[11px] text-tertiary mt-1">
                    Copied — expires in 7 days. The group key is never in the link.
                  </Text>
                </View>
                <Button variant="secondary" fullWidth icon="ti-share" onPress={() => void handleShare()}>
                  Share invite
                </Button>
              </View>
            )}
          </View>
        )}

        {/* Settle & close / reopen */}
        {canManage && (
          <Button
            variant="ghost"
            fullWidth
            icon={closed ? 'ti-lock-open' : 'ti-check'}
            disabled={busy}
            onPress={() =>
              void run(
                () => (closed ? reopenGroup(group.id) : closeGroup(group.id)),
                closed ? 'Group reopened' : 'Group settled & closed'
              )
            }
          >
            {closed ? 'Reopen group' : 'Settle & close'}
          </Button>
        )}

        {/* Leave */}
        <Pressable
          onPress={() => setConfirmLeave(true)}
          disabled={busy}
          className="w-full flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl"
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          <Icon name="ti-logout" size={15} color={theme.danger} />
          <Text className="text-sm font-semibold" style={{ color: theme.danger }}>
            Leave group
          </Text>
        </Pressable>
      </View>

      <ConfirmDialog
        isOpen={confirmLeave}
        title="Leave this group?"
        message="You'll stop receiving its shared expenses on this device. Balances aren't deleted for others."
        confirmLabel="Leave"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmLeave(false);
          void run(async () => {
            await leaveGroup(group.id);
            onClose();
          }, 'Left the group');
        }}
        onClose={() => setConfirmLeave(false)}
      />
    </Modal>
  );
}
