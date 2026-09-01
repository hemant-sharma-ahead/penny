import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { SmsAccountMapping } from '@/core/db/types';
import { Modal, Button } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { UseSmsTrackingReturn } from './useSmsTracking';

interface MappingEditModalProps {
  sms: UseSmsTrackingReturn;
  mapping: SmsAccountMapping | null;
  onClose: () => void;
}

/** Editable sender-mapping list row → modal (plan §3/§7) — re-point a previously-confirmed sender/card
 *  mapping at a different account, or remove it entirely (the sender then falls back to the ordinary
 *  ambiguous-account review flow next time it's seen). */
export function MappingEditModal({ sms, mapping, onClose }: MappingEditModalProps) {
  const theme = useThemeColors();
  const [selected, setSelected] = useState(mapping?.accountId ?? '');
  if (!mapping) return null;
  const nonArchived = sms.accounts.filter((a) => !a.isArchived);

  return (
    <Modal
      onClose={onClose}
      title="Edit mapping"
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              variant="danger"
              fullWidth
              onPress={() => {
                void sms.deleteMapping(mapping).then(onClose);
              }}
            >
              Remove
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant="primary"
              fullWidth
              disabled={!selected}
              onPress={() => {
                void sms.editMapping(mapping, selected).then(onClose);
              }}
            >
              Save
            </Button>
          </View>
        </View>
      }
    >
      <Text className="text-xs text-secondary mb-1">
        {mapping.rawValue} — {mapping.kind === 'card_last4' ? 'card → underlying account' : 'bank-string mapping'}
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
      </View>
    </Modal>
  );
}
