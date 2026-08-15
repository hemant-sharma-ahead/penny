import { View, Text } from 'react-native';
import type { SmsTransactionRecord } from '@/core/db/types';
import { Modal, Button } from '~/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';

interface DuplicateSmsModalProps {
  record: SmsTransactionRecord;
  others: SmsTransactionRecord[];
  onSame: () => void;
  onClose: () => void;
}

function Col({ record }: { record: SmsTransactionRecord }) {
  const theme = useThemeColors();
  return (
    <View className="flex-1 p-2.5 bg-surface-2 rounded-xl gap-1">
      <Text className="text-[9px] uppercase tracking-wide text-tertiary">{record.sender}</Text>
      <Text className="text-sm font-bold text-primary">
        {record.amount != null ? formatCurrency(record.amount) : '—'}
      </Text>
      <Text className="text-xs text-secondary">{record.counterparty ?? 'No merchant text'}</Text>
      <Text className="text-[10px] text-tertiary">{record.date != null ? formatDate(record.date) : '—'}</Text>
      <Text className="text-[10px]" style={{ color: theme.textTertiary }}>
        {record.referenceNumber ? `Ref ${record.referenceNumber}` : 'No reference number'}
      </Text>
    </View>
  );
}

/**
 * "View both" — the comparison the mockup's "Possible duplicate SMS" tile opens before the user
 * confirms "these are the same" (plan §4b). "These are different" is a direct tile action with no modal
 * (see `SmsReviewPage.tsx`) since there's nothing to compare before making that call; this modal exists
 * specifically for the "I need to actually look at both before deciding" case.
 */
export function DuplicateSmsModal({ record, others, onSame, onClose }: DuplicateSmsModalProps) {
  return (
    <Modal
      onClose={onClose}
      title="Possible duplicate SMS"
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose}>
              Keep both
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="primary" fullWidth onPress={onSame}>
              These are the same
            </Button>
          </View>
        </View>
      }
    >
      <Text className="text-xs text-secondary mb-1">
        These look like they might describe the same real-world transaction — pick "These are the same" to keep only
        one, or "Keep both" if they're genuinely separate.
      </Text>
      <View className="flex-row gap-2">
        <Col record={record} />
        {others[0] && <Col record={others[0]} />}
      </View>
    </Modal>
  );
}
