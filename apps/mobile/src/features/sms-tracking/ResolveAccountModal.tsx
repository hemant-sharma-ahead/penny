import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account } from '@/core/db/types';
import { Modal, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { AccountFormModal } from '~/components/shared';
import { useAccountForm } from '~/hooks/useAccountForm';
import type { UseSmsTrackingReturn } from './useSmsTracking';

interface ResolveAccountModalProps {
  sms: UseSmsTrackingReturn;
  sender: string;
  onPick: (accountId: string) => void;
  onClose: () => void;
}

/**
 * "Which account is this?" (mockup, §1's "Map this sender" modal / §3's ambiguous-account-resolution
 * flow) — fires for an `'ambiguous_account'` review-queue item. Picking an existing account (or creating
 * a new one inline, via the same shared `AccountFormModal` every other add-account entry point uses)
 * persists a durable sender→account mapping so this same sender never re-prompts (plan §3) — never a
 * one-shot guess re-run every scan.
 */
export function ResolveAccountModal({ sms, sender, onPick, onClose }: ResolveAccountModalProps) {
  const theme = useThemeColors();
  const [selected, setSelected] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const accountForm = useAccountForm(sms.saveAccountForForm, sms.accounts);
  const nonArchived = sms.accounts.filter((a: Account) => !a.isArchived);

  return (
    <>
      <Modal
        onClose={onClose}
        title="Which account is this?"
        footer={
          <Button variant="primary" fullWidth disabled={!selected} onPress={() => onPick(selected)}>
            Save mapping
          </Button>
        }
      >
        <Text className="text-xs text-secondary mb-1">
          We saw a transaction SMS from &quot;{sender}&quot; that doesn&apos;t match an account yet.
        </Text>
        <View>
          {nonArchived.map((acc) => {
            const on = selected === acc.id;
            return (
              <Pressable
                key={acc.id}
                onPress={() => setSelected(acc.id)}
                className="flex-row items-center gap-2.5 py-2 border-t border-theme"
              >
                <View
                  className="w-4 h-4 rounded-full border-2 items-center justify-center"
                  style={{ borderColor: on ? theme.primary : theme.border }}
                >
                  {on && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary }} />}
                </View>
                <Text className="text-sm" style={{ color: theme.textPrimary, fontWeight: on ? '700' : '400' }}>
                  {acc.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              setCreating(true);
              accountForm.openAdd();
            }}
            className="flex-row items-center gap-2.5 py-2 border-t border-theme"
          >
            <Icon name="ti-plus" size={14} color={theme.primary} />
            <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
              Create new account
            </Text>
          </Pressable>
        </View>
        <Text className="text-[9.5px] text-tertiary leading-relaxed mt-2">
          This mapping applies to every future SMS from this sender — editable any time from this screen.
        </Text>
      </Modal>

      {creating && accountForm.showForm && (
        <AccountFormModal
          form={{
            ...accountForm,
            close: () => {
              setCreating(false);
              accountForm.close();
            },
            save: async () => {
              setSavingAccount(true);
              try {
                const record = await accountForm.save();
                setCreating(false);
                if (record) setSelected(record.id);
                return record;
              } finally {
                setSavingAccount(false);
              }
            }
          }}
          saving={savingAccount}
        />
      )}
    </>
  );
}
