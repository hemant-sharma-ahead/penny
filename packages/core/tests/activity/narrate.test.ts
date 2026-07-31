import { describe, expect, it } from 'vitest';
import { narrateDay, weeklyStats } from '@/core/activity/narrate';
import type { ActivityLog } from '@/core/db/types';

const NOW = new Date('2026-06-25T12:00:00').getTime();

function entry(over: Partial<ActivityLog>): ActivityLog {
  return {
    id: crypto.randomUUID(),
    timestamp: NOW,
    action: 'CREATE',
    entityType: 'expense',
    entityId: 'x',
    summary: 's',
    ...over
  };
}

describe('narrateDay', () => {
  it('gives a resting message when nothing happened today', () => {
    expect(narrateDay([], NOW)).toContain('breather');
  });

  it('summarises today’s actions in Chip voice', () => {
    const out = narrateDay(
      [
        entry({ action: 'CREATE' }),
        entry({ action: 'CREATE' }),
        entry({ action: 'DELETE', entityCount: 1 }),
        entry({ action: 'BULK_MOVE', entityCount: 4 })
      ],
      NOW
    );
    expect(out).toContain('added 2 things');
    expect(out).toContain('reorganised 4 transactions');
    expect(out).toContain('cleared out 1');
  });

  it('ignores entries from other days', () => {
    const old = entry({ timestamp: NOW - 5 * 86_400_000, action: 'CREATE' });
    expect(narrateDay([old], NOW)).toContain('breather');
  });
});

describe('weeklyStats', () => {
  it('aggregates the last 7 days', () => {
    const stats = weeklyStats(
      [entry({ action: 'CREATE' }), entry({ action: 'CREATE' }), entry({ action: 'DELETE', entityCount: 2 })],
      NOW
    );
    expect(stats).toMatchObject({ total: 3, added: 2, removed: 2 });
  });

  it('excludes checkpoints / system markers', () => {
    const stats = weeklyStats(
      [entry({ action: 'CREATE' }), entry({ action: 'CHECKPOINT', entityType: 'system' })],
      NOW
    );
    expect(stats?.total).toBe(1);
  });

  it('returns null for an empty week', () => {
    expect(weeklyStats([], NOW)).toBeNull();
  });
});
