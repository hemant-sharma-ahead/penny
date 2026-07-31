import { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import type { Liability } from '@/core/db/types';
import { formatCurrency, formatMonthsDuration } from '@/lib/formatters';
import { deriveTenureMonths } from '@/core/loans/amortization';
import { getLoanMeta } from '@/core/loans/meta';
import { Card, Button, EmptyState, DetailRow, Badge, ConfirmDialog } from '~/components/ui';
import { ListRow } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { AddLoanModal } from './AddLoanModal';

interface MyLoansTabProps {
  emiLoans: Liability[];
  masked: boolean;
  saveLiability: (l: Liability) => Promise<unknown>;
  deleteLiability: (id: string) => Promise<unknown>;
  onPlanLoan: (l: Liability) => void;
}

function estimatedMonthsLeft(l: Liability): number | null {
  if (l.emiAmount) return deriveTenureMonths(l.outstandingAmount, l.interestRate, l.emiAmount);
  if (l.endDate) return Math.max(0, Math.round((l.endDate - Date.now()) / (30.44 * 24 * 60 * 60 * 1000)));
  return null;
}

export function MyLoansTab({ emiLoans, masked, saveLiability, deleteLiability, onPlanLoan }: MyLoansTabProps) {
  const theme = useThemeColors();
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [editLoan, setEditLoan] = useState<Liability | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Liability | null>(null);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
      {emiLoans.length === 0 ? (
        <View className="py-8">
          <EmptyState
            icon="ti-building-bank"
            title="No loans tracked yet"
            description="Track your home, car, or personal loans to plan repayment."
            action={{ label: 'Add Loan', onPress: () => setShowAddLoan(true), icon: 'ti-plus' }}
          />
        </View>
      ) : (
        <View className="gap-3">
          <Button variant="secondary" fullWidth icon="ti-plus" onPress={() => setShowAddLoan(true)}>
            Add Loan
          </Button>
          {emiLoans.map((l) => {
            const meta = getLoanMeta(l.type);
            const monthsLeft = estimatedMonthsLeft(l);
            return (
              <Card key={l.id}>
                <ListRow
                  icon={meta.icon}
                  iconColor={meta.color}
                  iconSize="sm"
                  title={<Text className="text-sm font-semibold text-primary leading-tight">{l.name}</Text>}
                  subtitle={l.lenderName ? <Text className="text-xs text-tertiary">{l.lenderName}</Text> : undefined}
                  right={
                    <View className="flex-row items-center gap-0.5">
                      <Badge label={meta.label} color={meta.color} size="sm" rounded="md" />
                      <Button
                        variant="ghost"
                        icon="ti-pencil"
                        textColor={theme.textTertiary}
                        accessibilityLabel={`Edit ${l.name}`}
                        className="w-8 h-8 rounded-lg"
                        onPress={() => setEditLoan(l)}
                      />
                      <Button
                        variant="ghost"
                        icon="ti-trash"
                        textColor={theme.textTertiary}
                        accessibilityLabel={`Delete ${l.name}`}
                        className="w-8 h-8 rounded-lg"
                        onPress={() => setDeleteTarget(l)}
                      />
                    </View>
                  }
                />

                <View className="gap-1.5 mt-3">
                  <DetailRow
                    label="Outstanding"
                    value={masked ? '••••' : formatCurrency(l.outstandingAmount)}
                    size="md"
                  />
                  {l.emiAmount && (
                    <DetailRow label="EMI / month" value={masked ? '••••' : formatCurrency(l.emiAmount)} size="md" />
                  )}
                  <DetailRow label="Rate" value={`${l.interestRate}% p.a.`} size="md" />
                </View>

                {monthsLeft !== null && (
                  <DetailRow className="mt-2" label="Estimated remaining" value={formatMonthsDuration(monthsLeft)} />
                )}

                <Button
                  variant="secondary"
                  fullWidth
                  icon="ti-calculator"
                  className="mt-3"
                  onPress={() => onPlanLoan(l)}
                >
                  Plan this loan
                </Button>
              </Card>
            );
          })}
        </View>
      )}

      {(showAddLoan || editLoan) && (
        <AddLoanModal
          saveLiability={saveLiability}
          loan={editLoan ?? undefined}
          onClose={() => {
            setShowAddLoan(false);
            setEditLoan(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void deleteLiability(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete this loan?"
        message={`"${deleteTarget?.name ?? ''}" will be removed. You can undo right after.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </ScrollView>
  );
}
