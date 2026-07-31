import { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatDate } from '@/lib/date';
import { expenseCategoriesRepo, accountsRepo, expensesRepo } from '@/core/db/repositories';

interface Candidate {
  id: string;
  name: string;
  createdAt: number;
  kind: 'category' | 'account';
}

/**
 * RN port of apps/web-react/src/features/import/ImportCleanupPanel.tsx — same temporary cleanup tool
 * (only ever surfaces non-default categories/accounts with ZERO attached expenses, so nothing with real
 * transaction history can be removed by mistake), added here 2026-07-31 to close a mobile-only gap found
 * via the parity sweep. Web's checkbox `<input>` list becomes the same `ti-square`/`ti-square-check-filled`
 * `Icon` toggle pattern already used for tag "set aside" selection in `ExpenseForm.tsx`, since RN has no
 * native checkbox element.
 */
export function ImportCleanupPanel({ onClose }: { onClose: () => void }) {
  const theme = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([expenseCategoriesRepo.getAll(), accountsRepo.getAll(), expensesRepo.getAll()])
      .then(([cats, accts, exps]) => {
        const usedCategoryIds = new Set(exps.map((e) => e.categoryId));
        const usedAccountIds = new Set(
          exps.flatMap((e) => [e.accountId, e.toAccountId]).filter((id): id is string => !!id)
        );
        const catCandidates: Candidate[] = cats
          .filter((c) => !c.isDefault && !usedCategoryIds.has(c.id))
          .map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt, kind: 'category' as const }));
        const acctCandidates: Candidate[] = accts
          .filter((a) => !usedAccountIds.has(a.id))
          .map((a) => ({ id: a.id, name: a.name, createdAt: a.createdAt, kind: 'account' as const }));
        setCandidates([...catCandidates, ...acctCandidates].sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    setDeleting(true);
    for (const c of candidates) {
      if (!selected.has(c.id)) continue;
      if (c.kind === 'category') await expenseCategoriesRepo.delete(c.id);
      else await accountsRepo.delete(c.id);
    }
    setDeleting(false);
    onClose();
  }

  return (
    <Modal
      title="Clean up unused categories & accounts"
      onClose={onClose}
      scrollable
      footer={
        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={selected.size === 0 || deleting}
            loading={deleting}
            onPress={() => void deleteSelected()}
          >
            Delete{selected.size > 0 ? ` ${selected.size}` : ''} selected
          </Button>
        </View>
      }
    >
      <Text className="text-xs text-secondary mb-3 leading-relaxed">
        These custom categories/accounts have <Text className="font-bold">zero transactions attached</Text> — most
        likely leftovers from earlier import testing. Select anything you don't recognize as intentional and delete it.
        Anything with real transaction history is never shown here, so nothing you actually use can get removed by
        mistake.
      </Text>
      {loading ? (
        <Text className="text-xs text-tertiary">Checking…</Text>
      ) : candidates.length === 0 ? (
        <Text className="text-xs text-tertiary">Nothing unused found — no cleanup needed.</Text>
      ) : (
        <View>
          {candidates.map((c, i) => {
            const checked = selected.has(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                className={`flex-row items-center gap-2 py-2 ${i > 0 ? 'border-t border-theme' : ''}`}
              >
                <Icon
                  name={checked ? 'ti-square-check-filled' : 'ti-square'}
                  size={16}
                  color={checked ? theme.primary : theme.textTertiary}
                />
                <Text className="text-xs font-semibold text-primary">{c.name}</Text>
                <Text className="text-xs text-tertiary">
                  {c.kind} · {formatDate(c.createdAt)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Modal>
  );
}
