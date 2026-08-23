import { useEffect, useState } from 'react';
import { View, Pressable, Share, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal, Button, ConfirmDialog, TextInput, Badge } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { profileRepo, groupMembersRepo } from '@/core/db/repositories';
import {
  addStaticMember,
  buildJoinLink,
  closeGroup,
  createInvite,
  deleteGroup,
  leaveGroup,
  reopenGroup,
  removeMemberAndRotate,
  setMemberRole
} from '@/core/groups/groupsService';
import { groupFeed } from '@/core/groups/groupSync';
import type { Group, GroupMember } from '@/core/db/types';
import { useServerActionError } from '~/hooks/useServerActionError';

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingStatic, setAddingStatic] = useState(false);
  const [staticName, setStaticName] = useState('');
  // Delete-when-empty (item 9) — a real "shared expense" count, distinct from the members list, so
  // "Delete group" can stay disabled with an explanatory reason until it's genuinely zero.
  const [sharedExpenseCount, setSharedExpenseCount] = useState<number | null>(null);

  const reload = () =>
    Promise.all([groupMembersRepo.getAll(), profileRepo.getAll(), groupFeed(group.id)]).then(([all, profile, feed]) => {
      setMembers(all.filter((m) => m.groupId === group.id && m.status === 'active'));
      setMyId(profile[0]?.userId);
      setSharedExpenseCount(feed.filter((e) => e.type === 'shared_expense' || e.type === 'expense_edit').length);
    });

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  const myRole = members.find((m) => m.userId === myId)?.role ?? 'member';
  const canManage = myRole === 'owner' || myRole === 'admin';
  const isCreator = !!myId && myId === group.ownerId;
  const closed = group.status === 'closed';
  const canDeleteGroup = isCreator && sharedExpenseCount === 0;

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

  // "Add without invite" (item 17) — a name-only placeholder, no account/invite step. Participates in
  // splits/balances but can never sync/confirm anything itself; a real member manages their side.
  async function handleAddStatic() {
    const name = staticName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await addStaticMember(group.id, name);
      showToast({ message: `Added ${name} — record their splits/settlements yourself` });
      setStaticName('');
      setAddingStatic(false);
      await reload();
      onChanged();
    } catch (err) {
      onError(err, 'Could not add the member');
    } finally {
      setBusy(false);
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
                <View className="w-7 h-7 rounded-full bg-surface-3 items-center justify-center">
                  <Text className="text-xs font-semibold text-secondary">
                    {(m.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 flex-row items-center gap-1.5 flex-wrap">
                  <Text className="text-sm text-primary" numberOfLines={1}>
                    {m.userId === myId ? 'You' : m.displayName}
                    <Text className="text-[11px] text-tertiary"> · {m.role}</Text>
                  </Text>
                  {m.accountless && <Badge label="No account" color={theme.textTertiary} size="sm" />}
                </View>
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

        {/* Invite — two equally-weighted paths (item 17): a real invite (they get an account), or a
            name-only placeholder for someone without the app. */}
        {canManage && !closed && (
          <View className="gap-2">
            <Button
              variant="secondary"
              fullWidth
              icon="ti-user-plus"
              disabled={busy}
              onPress={() => void handleInvite()}
            >
              Invite (they&apos;ll get an account)
            </Button>
            <Button
              variant="secondary"
              fullWidth
              icon="ti-user-edit"
              disabled={busy}
              onPress={() => setAddingStatic(true)}
            >
              Add without invite
            </Button>
            {inviteLink.length > 0 && (
              <View className="mt-1 gap-2">
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

        {/* Danger zone (DESIGN_GUIDELINES.md §2 — isolate destructive actions) — a creator-only
            "Delete group" (item 9), disabled with an explanatory reason until every shared expense is
            gone, plus "Leave group" (moved in here from its own standalone button — the only other
            destructive action on this screen). */}
        <View
          className="rounded-2xl p-3 gap-2"
          style={{ borderWidth: 1, borderColor: `${theme.danger}4d`, backgroundColor: `${theme.danger}0f` }}
        >
          <Text className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: theme.danger }}>
            Danger zone
          </Text>
          {isCreator && (
            <View className="gap-1.5">
              <Button
                variant="danger"
                fullWidth
                icon="ti-trash"
                disabled={!canDeleteGroup || busy}
                onPress={() => setConfirmDelete(true)}
              >
                Delete group
              </Button>
              <Text className="text-[10.5px] text-tertiary leading-relaxed">
                {canDeleteGroup
                  ? 'This group has no expenses recorded — deleting it removes it for every member.'
                  : `Only available once every shared expense is removed from this group (${sharedExpenseCount ?? '…'} remaining). Use Settle & close instead to freeze it now.`}
              </Text>
            </View>
          )}
          {/* Leave — matches web's <Button variant="ghost" className="w-full text-danger"> via the
              shared Button's textColor override, rather than a bespoke Pressable. */}
          <Button
            variant="ghost"
            fullWidth
            icon="ti-logout"
            textColor={theme.danger}
            disabled={busy}
            onPress={() => setConfirmLeave(true)}
          >
            Leave group
          </Button>
        </View>
      </View>

      {addingStatic && (
        <Modal
          onClose={() => setAddingStatic(false)}
          title="Add placeholder member"
          footer={
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" fullWidth onPress={() => setAddingStatic(false)} disabled={busy}>
                  Cancel
                </Button>
              </View>
              <View className="flex-1">
                <Button fullWidth disabled={!staticName.trim()} loading={busy} onPress={() => void handleAddStatic()}>
                  Add
                </Button>
              </View>
            </View>
          }
        >
          <View className="gap-3">
            <TextInput value={staticName} onChange={setStaticName} placeholder="e.g. Grandma" autoFocus />
            <Text className="text-xs text-tertiary leading-relaxed">
              You&apos;ll manage their splits and settlements — they can&apos;t open this group themselves.
            </Text>
          </View>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete "${group.name || 'this group'}"?`}
        message="This can't be undone. Every member loses access and the group disappears from their list too."
        confirmLabel="Delete"
        loading={busy}
        onConfirm={() => {
          setConfirmDelete(false);
          void run(async () => {
            await deleteGroup(group.id);
            onClose();
          }, 'Group deleted');
        }}
        onClose={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        isOpen={confirmLeave}
        title="Leave this group?"
        message="You'll keep seeing everything that happened before, read-only — it just won't update, and you can't add anything new or rejoin from here. Balances aren't deleted for others."
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
