import { useState, useEffect } from 'react';
import { View, Pressable, Text } from 'react-native';
import { EmptyState } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { fetchMetalPrices } from '@/core/metals/metalsClient';
import type { Holding } from '@/core/db/types';
import { useThemeColors } from '~/theme/useThemeColors';
import { PreciousMetalCard } from './PreciousMetalCard';
import { GoldModal } from './GoldModal';

interface PreciousMetalsSectionProps {
  holdings: Holding[];
  masked: boolean;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Precious metals slice: fetches live spot prices, renders gold/silver cards, and
// owns its own add/edit modal.
export function PreciousMetalsSection({ holdings, masked, onSave, onRemove }: PreciousMetalsSectionProps) {
  const theme = useThemeColors();
  const [spotGold, setSpotGold] = useState<number | null>(null);
  const [spotSilver, setSpotSilver] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ editing: Holding | null } | null>(null);

  useEffect(() => {
    fetchMetalPrices()
      .then(({ gold, silver }) => {
        setSpotGold(gold);
        setSpotSilver(silver);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <View className="px-4 py-3 flex-col gap-3">
      {holdings.length === 0 ? (
        <EmptyState
          icon="ti-coin"
          title="No precious metal holdings yet"
          description="Tap + to track gold or silver."
        />
      ) : (
        <>
          {loading && <Text className="text-[10px] text-center text-tertiary">Fetching live prices…</Text>}
          {holdings.map((h) => (
            <PreciousMetalCard
              key={h.id}
              holding={h}
              spotGold={spotGold}
              spotSilver={spotSilver}
              onEdit={() => setForm({ editing: h })}
              masked={masked}
            />
          ))}
        </>
      )}
      <Pressable
        onPress={() => setForm({ editing: null })}
        className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border-2"
        style={{ borderColor: theme.border, borderStyle: 'dashed' }}
      >
        <Icon name="ti-plus" size={16} color={theme.textTertiary} />
        <Text className="text-sm font-medium text-tertiary">Add Gold / Silver</Text>
      </Pressable>

      {form && (
        <GoldModal
          editing={form.editing}
          onSave={async (h) => {
            await onSave(h);
            setForm(null);
          }}
          // Close first, then remove — see RetirementSection.tsx's `del` for the full rationale
          // (closing-after-remove let the Undo toast stack a second native Modal on top of this
          // one, and both tearing down together could background the whole app).
          onDelete={(id) => {
            setForm(null);
            void onRemove(id).catch(() => {});
          }}
          onClose={() => setForm(null)}
        />
      )}
    </View>
  );
}
