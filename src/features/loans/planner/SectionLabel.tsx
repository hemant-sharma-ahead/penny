import type { ReactNode } from 'react';

/** Small uppercase section label used between planner cards. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">{children}</p>;
}
