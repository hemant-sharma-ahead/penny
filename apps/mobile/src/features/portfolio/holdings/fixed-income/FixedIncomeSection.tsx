import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { EmptyState } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Holding } from '@/core/db/types';
import { FdCard } from './FdCard';
import { RdCard } from './RdCard';
import { FdModal } from './FdModal';

interface FixedIncomeSectionProps {
  holdings: Holding[];
  masked: boolean;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Fixed Income (FD/RD) slice: renders the cards and owns its own add/edit modal.
export function FixedIncomeSection({ holdings, masked, onSave, onRemove }: FixedIncomeSectionProps) {
  const theme = useThemeColors();
  // null = closed; { editing: null } = adding; { editing: h } = editing.
  const [form, setForm] = useState<{ editing: Holding | null } | null>(null);

  return (
    <View className="px-4 py-3 flex flex-col gap-3">
      {holdings.length === 0 ? (
        <EmptyState
          icon="ti-building-bank"
          title="No FDs or RDs yet"
          description="Tap + to track your fixed deposits."
        />
      ) : (
        holdings.map((h) =>
          h.assetMeta?.fdSubType === 'rd' ? (
            <RdCard key={h.id} holding={h} onEdit={() => setForm({ editing: h })} masked={masked} />
          ) : (
            <FdCard key={h.id} holding={h} onEdit={() => setForm({ editing: h })} masked={masked} />
          )
        )
      )}
      {/* Bottom-of-list, dashed-border "add new" affordance — a one-off regression fixed to match
       *  `PreciousMetalsSection`'s (correctly-kept) same pattern, found via the 2026-07-26 parity sweep. */}
      <Pressable
        onPress={() => setForm({ editing: null })}
        className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border-2"
        style={{ borderColor: theme.border, borderStyle: 'dashed' }}
      >
        <Icon name="ti-plus" size={16} color={theme.textTertiary} />
        <Text className="text-sm font-medium text-tertiary">Add FD / RD</Text>
      </Pressable>

      {form && (
        <FdModal
          editing={form.editing}
          onSave={async (h) => {
            await onSave(h);
            setForm(null);
          }}
          onDelete={(id) => {
            void onRemove(id).then(() => setForm(null));
          }}
          onClose={() => setForm(null)}
        />
      )}
    </View>
  );
}
