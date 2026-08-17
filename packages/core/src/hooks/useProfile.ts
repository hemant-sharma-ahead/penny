import { useRepository } from './useRepository';
import { profileRepo } from '@/core/db/repositories';
import type { Profile } from '@/core/db/types';

/** The single profile record (or null while loading / before onboarding completes). */
export function useProfile(): { profile: Profile | null; loading: boolean; reload: () => void } {
  const { items, loading, reload } = useRepository(profileRepo);
  return { profile: items[0] ?? null, loading, reload };
}
