import { useCallback, useEffect, useState } from 'react';
import type { EncryptedRepository } from '@/core/db/repository';

interface State<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

export function useRepository<T extends { id: string }>(repo: EncryptedRepository<T>) {
  const [state, setState] = useState<State<T>>({ items: [], loading: true, error: null });

  const load = useCallback(() => {
    let cancelled = false;
    repo
      .getAll()
      .then((items) => {
        if (!cancelled) setState({ items, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ items: [], loading: false, error: err instanceof Error ? err.message : 'Load failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  useEffect(() => load(), [load]);

  const save = useCallback(
    async (item: T) => {
      await repo.put(item);
      setState((s) => {
        const idx = s.items.findIndex((i) => i.id === item.id);
        const items = idx >= 0 ? s.items.map((i) => (i.id === item.id ? item : i)) : [...s.items, item];
        return { ...s, items };
      });
    },
    [repo]
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.delete(id);
      setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
    },
    [repo]
  );

  return { ...state, save, remove, reload: load };
}
