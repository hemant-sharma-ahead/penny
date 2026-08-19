import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal, Button, TextInput, SegmentedControl, Banner } from '~/components/ui';
import { WizardProgress } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
import { useGroupContext } from '~/context/GroupContext';
import { useServerActionError } from '~/hooks/useServerActionError';
import { formatCurrency } from '@/lib/formatters';
import { profileRepo } from '@/core/db/repositories';
import { addStaticMember, buildJoinLink, createGroup, createInvite } from '@/core/groups/groupsService';
import { appendGroupEvent } from '@/core/groups/groupSync';
import type { GroupHistoryVisibility, GroupType, LedgerEntry, Person } from '@/core/db/types';
import type { ThemeTokens } from '@penny/core/theme/tokens';

const TYPES: { value: GroupType; label: string }[] = [
  { value: 'family', label: 'Family' },
  { value: 'trip', label: 'Trip' },
  { value: 'roommates', label: 'Roommates' },
  { value: 'other', label: 'Other' }
];

type SeedMode = 'full' | 'opening_balance';

interface PromoteToGroupWizardProps {
  person: Person;
  /** This person's ledger entries, any order. */
  entries: LedgerEntry[];
  /** Net balance: positive ⇒ they owe you; negative ⇒ you owe them. */
  net: number;
  onClose: () => void;
  /** Called once the Group is created, seeded, and invited — the caller archives the personal ledger
   *  (`Person.isArchived` + `promotedToGroupId`) since only `IouView.tsx`'s `useIou()` instance owns
   *  that logged save path. */
  onPromoted: (result: { groupId: string; groupName: string }) => Promise<void> | void;
}

/**
 * Guided wizard: promote a personal IOU ledger to a real Group (item 17, real-device-testing-pass.md
 * Phase 3). Creates a Group, adds the person as a placeholder member (§5's same `accountless` shape,
 * bridged via `linkedPersonId`) so their name/history render immediately, seeds it from the ledger
 * (either the full history or a single opening-balance entry — an explicit extra step per product
 * decision), generates an invite for them, then hands back to the caller to archive the personal
 * ledger. One-way — the personal ledger is archived, never deleted, but not designed to be reversed
 * back to "not promoted" (see the mockup's closing notes, groups-redesign-v1.html §4).
 */
export function PromoteToGroupWizard({ person, entries, net, onClose, onPromoted }: PromoteToGroupWizardProps) {
  const theme = useThemeColors();
  const { showToast } = useToast();
  const onError = useServerActionError();
  const { setContext, refresh } = useGroupContext();
  const [myId, setMyId] = useState<string | undefined>();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(person.name);
  const [type, setType] = useState<GroupType>('other');
  const [historyVisibility, setHistoryVisibility] = useState<GroupHistoryVisibility>('from_join');
  const [seedMode, setSeedMode] = useState<SeedMode>('full');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void profileRepo.getAll().then((all) => setMyId(all[0]?.userId));
  }, []);

  const settled = Math.abs(net) < 1;
  const openingAmount = Math.abs(net);

  async function handlePromote() {
    if (!myId || saving) return;
    setSaving(true);
    try {
      const group = await createGroup({ name: name.trim() || person.name, type, historyVisibility });
      const member = await addStaticMember(group.id, person.name, { linkedPersonId: person.id });

      if (seedMode === 'full') {
        const sorted = [...entries].sort((a, b) => a.date - b.date || a.createdAt - b.createdAt);
        for (const e of sorted) {
          if (e.kind === 'lent') {
            await appendGroupEvent(group.id, 'shared_expense', {
              expenseId: crypto.randomUUID(),
              amount: e.amount,
              payer: myId,
              shares: { [myId]: 0, [member.userId]: e.amount },
              description: e.description || `Lent to ${person.name}`
            });
          } else if (e.kind === 'borrowed') {
            await appendGroupEvent(group.id, 'shared_expense', {
              expenseId: crypto.randomUUID(),
              amount: e.amount,
              payer: member.userId,
              shares: { [myId]: e.amount, [member.userId]: 0 },
              description: e.description || `Borrowed from ${person.name}`
            });
          } else {
            const [from, to] = e.settleDirection === 'you_paid_them' ? [myId, member.userId] : [member.userId, myId];
            await appendGroupEvent(group.id, 'settlement', {
              id: crypto.randomUUID(),
              from,
              to,
              amount: e.amount,
              kind: 'repayment'
            });
          }
        }
      } else if (!settled) {
        // Single opening-balance entry that starts the new Group at the same net the personal ledger
        // ended at, without replaying every historical line.
        if (net > 0) {
          await appendGroupEvent(group.id, 'shared_expense', {
            expenseId: crypto.randomUUID(),
            amount: net,
            payer: myId,
            shares: { [myId]: 0, [member.userId]: net },
            description: 'Opening balance carried over'
          });
        } else {
          await appendGroupEvent(group.id, 'shared_expense', {
            expenseId: crypto.randomUUID(),
            amount: -net,
            payer: member.userId,
            shares: { [myId]: -net, [member.userId]: 0 },
            description: 'Opening balance carried over'
          });
        }
      }

      // Generate (not auto-send) an invite — mirrors today's manual "Create invite link" flow;
      // actually getting it to them is a follow-up from the new group's own Members screen.
      const { secret } = await createInvite(group.id, { role: 'member' });
      const link = buildJoinLink(secret);
      await Clipboard.setStringAsync(link).catch(() => undefined);

      refresh();
      setContext(group.id);
      await onPromoted({ groupId: group.id, groupName: group.name || name.trim() || person.name });
      showToast({ message: `Promoted to "${group.name || name}" — invite link copied to clipboard` });
      onClose();
    } catch (err) {
      if (!onError(err, 'Could not promote to a group')) setSaving(false);
    }
  }

  const totalSteps = 4;

  return (
    <Modal
      onClose={onClose}
      title={`Promote ${person.name}`}
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              variant="secondary"
              fullWidth
              disabled={saving}
              onPress={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              fullWidth
              disabled={(step === 1 && !name.trim()) || saving}
              loading={saving}
              onPress={() => (step === totalSteps - 1 ? void handlePromote() : setStep((s) => s + 1))}
            >
              {step === totalSteps - 1 ? 'Create & promote' : 'Continue'}
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-3">
        <WizardProgress
          stepIndex={step}
          totalSteps={totalSteps}
          stepLabel={['Explain', 'Group details', 'History', 'Confirm'][step] ?? ''}
        />

        {step === 0 && (
          <View className="gap-3">
            <Text className="text-sm text-secondary leading-relaxed">
              This creates a real <Text className="font-semibold text-primary">Group</Text> named "{person.name}", adds{' '}
              {person.name} to it, and invites them to join.
            </Text>
            <Banner variant="info" icon="ti-archive">
              Your personal ledger with {person.name} will be archived — kept for your records, but no longer active.
            </Banner>
          </View>
        )}

        {step === 1 && (
          <View className="gap-4">
            <TextInput
              label="Group name"
              value={name}
              onChange={setName}
              placeholder="e.g. Goa Trip"
              required
              autoFocus
            />
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
                value={historyVisibility}
                onChange={setHistoryVisibility}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View className="gap-3">
            <Text className="text-xs font-medium text-secondary mb-1.5">History to bring into the new group</Text>
            <SegmentedControl
              options={[
                { value: 'full' as const, label: 'Full history' },
                { value: 'opening_balance' as const, label: 'Opening balance only' }
              ]}
              value={seedMode}
              onChange={setSeedMode}
            />
            <Text className="text-[11px] text-tertiary leading-relaxed">
              {seedMode === 'full'
                ? `All ${entries.length} ledger entr${entries.length === 1 ? 'y' : 'ies'} are copied in as shared-expense/settlement history — the new group's balance starts exactly where your personal ledger left off.`
                : settled
                  ? "You're already settled up — no opening entry is needed."
                  : `A single opening entry (${formatCurrency(openingAmount)}) starts the new group at the same balance your personal ledger ended at, without replaying every past line.`}
            </Text>
          </View>
        )}

        {step === 3 && (
          <View className="rounded-xl bg-surface-2 border border-theme p-3 gap-2.5">
            <SummaryLine
              text={
                seedMode === 'full'
                  ? `${entries.length} ledger entr${entries.length === 1 ? 'y' : 'ies'} → seeded as shared history in "${name.trim() || person.name}"`
                  : settled
                    ? 'No opening entry needed — already settled up'
                    : `Opening balance of ${formatCurrency(openingAmount)} → seeded in "${name.trim() || person.name}"`
              }
              theme={theme}
            />
            <SummaryLine text={`Your personal ledger with ${person.name} → archived`} theme={theme} />
            <SummaryLine text={`An invite link is generated for ${person.name} to join`} theme={theme} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function SummaryLine({ text, theme }: { text: string; theme: ThemeTokens }) {
  return (
    <View className="flex-row items-start gap-1.5">
      <Icon name="ti-check" size={13} color={theme.success} />
      <Text className="flex-1 text-[12.5px] text-primary leading-relaxed">{text}</Text>
    </View>
  );
}
