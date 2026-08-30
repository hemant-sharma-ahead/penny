// Dedicated "pending transfer" popup (2026-08-30) — extracted OUT of `EpfEmployerDetailModal.tsx` per
// direct feedback: the company-details popup and the transfer-resolution flow are two different
// concerns and shouldn't be crammed into one screen. Reachable from either the card tile's own
// "Pending transfer" pill directly, or the same pill re-shown inside the detail popup — both funnel
// into this exact same component via `useEpfPendingTransfer`, so there's still only one real
// implementation of the resolution logic.
import { View, Pressable, Text } from 'react-native';
import { Modal, Button, AmountInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint, ink } from '~/lib/color';
import { formatCurrency } from '@/lib/formatters';
import type { Holding, EpfEmployer } from '@/core/db/types';
import { useEpfPendingTransfer } from './useEpfPendingTransfer';
import { EpfWhyTransferInfo } from './EpfWhyTransferInfo';

export function EpfPendingTransferModal({
  holding,
  employer,
  onSave,
  onClose
}: {
  holding: Holding;
  employer: EpfEmployer;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  const transfer = useEpfPendingTransfer(holding, employer, onSave);

  return (
    <>
      <Modal onClose={onClose} title="Pending transfer" size="sm">
        <View className="-mt-2 gap-3">
          {transfer.resolvedTransfer ? (
            <View
              className="rounded-xl border p-3 flex-row items-start gap-2"
              style={{ backgroundColor: tint(theme.success, 10), borderColor: tint(theme.success, 30) }}
            >
              <Icon name="ti-circle-check" size={16} color={theme.success} />
              <Text className="text-xs leading-relaxed flex-1" style={{ color: ink(theme.success, theme.textPrimary) }}>
                Transferred to{' '}
                <Text style={{ fontWeight: '700' }}>{transfer.resolvedTransfer.destination.companyName}</Text> on{' '}
                {new Date(transfer.resolvedTransfer.transaction.date).toLocaleDateString('en-IN', {
                  month: 'short',
                  year: 'numeric'
                })}
                {` — ${formatCurrency(transfer.resolvedTransfer.transaction.amount ?? 0)}`}.
              </Text>
            </View>
          ) : transfer.pendingTransferSuccessor ? (
            <>
              <View
                className="rounded-xl border p-3 gap-2"
                style={{ backgroundColor: tint(theme.info, 12), borderColor: tint(theme.info, 30) }}
              >
                <View className="flex-row items-start gap-2">
                  <Icon name="ti-transfer" size={16} color={theme.info} />
                  <Text
                    className="text-xs leading-relaxed flex-1"
                    style={{ color: ink(theme.info, theme.textPrimary) }}
                  >
                    Your PF balance from {employer.companyName} hasn&apos;t shown up as a transfer-in anywhere —
                    suggested destination: {transfer.pendingTransferSuccessor.companyName}.
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled={transfer.dismissing}
                      loading={transfer.dismissing}
                      onPress={transfer.dismissAsWithdrawn}
                    >
                      Withdrawn
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button variant="primary" size="sm" fullWidth color={theme.info} onPress={transfer.openConfirm}>
                      Transferred
                    </Button>
                  </View>
                  <View className="flex-1">
                    {/* "Pending" (2026-08-30, renamed from "Not sure yet") — same session-only hide,
                        just named for what it actually IS: the transfer genuinely hasn't happened/been
                        confirmed yet, not merely "unsure." */}
                    <Button variant="secondary" size="sm" fullWidth onPress={transfer.hideForNow}>
                      Pending
                    </Button>
                  </View>
                </View>
              </View>
              <View className="border-t border-theme pt-2">
                <EpfWhyTransferInfo />
              </View>
            </>
          ) : (
            <Text className="text-xs text-secondary leading-relaxed">
              No pending transfer for {employer.companyName} right now.
            </Text>
          )}
        </View>
      </Modal>

      {transfer.showConfirm && (
        <Modal onClose={() => transfer.setShowConfirm(false)} title="Confirm transfer" size="sm">
          <View className="-mt-2 gap-3">
            {transfer.destinationOptions.length > 1 && (
              <View className="gap-1.5">
                <Text className="text-[10px] font-medium text-tertiary uppercase tracking-wide">
                  Which employer did it go to?
                </Text>
                <View className="gap-1.5">
                  {transfer.destinationOptions.map((emp) => {
                    const selected = emp.id === transfer.destinationId;
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => transfer.setDestinationId(emp.id)}
                        className="flex-row items-center gap-2 px-3 py-2 rounded-xl border"
                        style={{
                          backgroundColor: selected ? tint(theme.info, 12) : theme.surface,
                          borderColor: selected ? theme.info : theme.border
                        }}
                      >
                        <View
                          className="w-4 h-4 rounded-full border items-center justify-center"
                          style={{ borderColor: selected ? theme.info : theme.textTertiary }}
                        >
                          {selected && (
                            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.info }} />
                          )}
                        </View>
                        <Text
                          className="text-xs flex-1"
                          style={{
                            color: selected ? theme.info : theme.textPrimary,
                            fontWeight: selected ? '700' : '400'
                          }}
                        >
                          {emp.companyName}
                        </Text>
                        {emp.id === transfer.pendingTransferSuccessor?.id && (
                          <Text className="text-[9px] text-tertiary">Suggested</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {transfer.destination && (
              <Text className="text-xs text-secondary leading-relaxed">
                Records a transfer-in on {transfer.destination.companyName} for this amount — it&apos;ll count toward
                your total EPF corpus again.
              </Text>
            )}
            <AmountInput
              label="Amount transferred"
              placeholder="0"
              value={transfer.amountDraft}
              onChange={transfer.setAmountDraft}
              autoFocus
            />
            <Button
              variant="primary"
              fullWidth
              loading={transfer.resolving}
              disabled={transfer.resolving || !transfer.destination || !(Number(transfer.amountDraft) > 0)}
              onPress={transfer.confirmTransfer}
            >
              Confirm
            </Button>
          </View>
        </Modal>
      )}
    </>
  );
}
