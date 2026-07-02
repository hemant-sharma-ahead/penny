import { useEffect, useState } from 'react';
import { Modal, Button, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
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

export function GroupMembersModal({
  group,
  onClose,
  onChanged
}: {
  group: Group;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
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
      showToast({ message: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite() {
    await run(async () => {
      const { secret } = await createInvite(group.id, { role: 'member' });
      const link = buildJoinLink(secret);
      setInviteLink(link);
      await navigator.clipboard?.writeText(link).catch(() => undefined);
    }, 'Invite link created & copied');
  }

  return (
    <Modal onClose={onClose} title={group.name || 'Group'} scrollable>
      <div className="flex flex-col gap-4">
        {/* Members */}
        <div>
          <p className="text-xs font-medium text-secondary mb-1.5">Members · {members.length}</p>
          <div className="surface rounded-xl divide-y divide-[color:var(--color-border)]">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-7 h-7 rounded-full bg-surface-3 grid place-items-center text-xs font-semibold text-secondary">
                  {(m.displayName || '?').charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 text-sm text-primary truncate">
                  {m.userId === myId ? 'You' : m.displayName}
                  <span className="text-[11px] text-tertiary"> · {m.role}</span>
                </span>
                {canManage && m.userId !== myId && m.role !== 'owner' && (
                  <>
                    <button
                      type="button"
                      className="text-[11px] text-[var(--color-primary)] font-medium"
                      onClick={() =>
                        run(
                          () => setMemberRole(group.id, m.userId, m.role === 'admin' ? 'member' : 'admin'),
                          'Role updated'
                        )
                      }
                    >
                      {m.role === 'admin' ? 'Make member' : 'Make admin'}
                    </button>
                    <button
                      type="button"
                      className="text-tertiary"
                      aria-label="Remove member"
                      onClick={() =>
                        run(() => removeMemberAndRotate(group.id, m.userId), 'Member removed · key rotated')
                      }
                    >
                      <i className="ti ti-user-minus" style={{ fontSize: 16 }} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Invite */}
        {canManage && !closed && (
          <div>
            <Button variant="ghost" onClick={handleInvite} disabled={busy} className="w-full">
              <i className="ti ti-user-plus" aria-hidden="true" /> Create invite link
            </Button>
            {inviteLink && (
              <div className="mt-2 text-[11px] text-secondary break-all bg-surface-2 rounded-lg px-3 py-2">
                {inviteLink}
                <p className="text-tertiary mt-1">Copied — expires in 7 days. The group key is never in the link.</p>
              </div>
            )}
          </div>
        )}

        {/* Settle & close / reopen */}
        {canManage && (
          <Button
            variant="ghost"
            onClick={() =>
              closed
                ? run(() => reopenGroup(group.id), 'Group reopened')
                : run(() => closeGroup(group.id), 'Group settled & closed')
            }
            disabled={busy}
            className="w-full"
          >
            <i className={`ti ${closed ? 'ti-lock-open' : 'ti-check'}`} aria-hidden="true" />
            {closed ? ' Reopen group' : ' Settle & close'}
          </Button>
        )}

        {/* Leave */}
        <Button variant="ghost" onClick={() => setConfirmLeave(true)} disabled={busy} className="w-full text-danger">
          <i className="ti ti-logout" aria-hidden="true" /> Leave group
        </Button>
      </div>

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
