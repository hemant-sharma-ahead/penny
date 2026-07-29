import { useEffect, useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { expenseCategoriesRepo, accountsRepo, expensesRepo } from '@/core/db/repositories';

interface Candidate {
  id: string;
  name: string;
  createdAt: number;
  kind: 'category' | 'account';
}

/**
 * Temporary cleanup tool for categories/accounts created by import testing before the review screen's
 * DB writes were deferred to the final Import click (2026-07-29 fix). Only ever surfaces non-default
 * categories/accounts with ZERO attached expenses — anything with real transaction history is never
 * shown here, so this can't accidentally orphan real data. Not a permanent feature; safe to remove once
 * the leftover test data from this session's earlier rounds has been cleared out.
 */
export function ImportCleanupPanel({ onClose }: { onClose: () => void }) {
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
    <Modal title="Clean up unused categories & accounts" onClose={onClose} scrollable>
      <p className="text-xs text-secondary mb-3 leading-relaxed">
        These custom categories/accounts have <b>zero transactions attached</b> — most likely leftovers from earlier
        import testing. Select anything you don&apos;t recognize as intentional and delete it. Anything with real
        transaction history is never shown here, so nothing you actually use can get removed by mistake.
      </p>
      {loading ? (
        <p className="text-xs text-tertiary">Checking…</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-tertiary">Nothing unused found — no cleanup needed.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
          {candidates.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-2 text-xs cursor-pointer">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="font-semibold text-primary">{c.name}</span>
              <span className="text-tertiary">
                {c.kind} · {new Date(c.createdAt).toLocaleDateString('en-IN')}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={selected.size === 0 || deleting}
          loading={deleting}
          onClick={() => void deleteSelected()}
        >
          Delete {selected.size > 0 ? selected.size : ''} selected
        </Button>
      </div>
    </Modal>
  );
}
