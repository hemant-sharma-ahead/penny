import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db/schema';
import { keystore } from '@/core/crypto/keystore';
import { initialize } from '@/core/crypto/securityManager';
import { logActivity, subscribeActivity } from '@/core/db/activityLog';

const PASS = 'correct horse battery staple';
const PIN = '123456';

describe('subscribeActivity', () => {
  beforeEach(async () => {
    await Promise.all([db.security.clear(), db.activity_log.clear()]);
    keystore.lock();
    await initialize(PASS, PIN);
  });

  it('notifies subscribers synchronously on logActivity and supports unsubscribe', () => {
    const seen: string[] = [];
    const unsub = subscribeActivity((e) => seen.push(e.entityId));

    logActivity({ action: 'CREATE', entityType: 'expense', entityId: 'e1', summary: 'Added' });
    expect(seen).toEqual(['e1']);

    unsub();
    logActivity({ action: 'CREATE', entityType: 'expense', entityId: 'e2', summary: 'Added' });
    expect(seen).toEqual(['e1']); // no further notifications after unsubscribe
  });

  it('a throwing listener does not disrupt logActivity or other listeners', () => {
    const good = vi.fn();
    const unsub1 = subscribeActivity(() => {
      throw new Error('boom');
    });
    const unsub2 = subscribeActivity(good);

    expect(() => logActivity({ action: 'UPDATE', entityType: 'goal', entityId: 'g1', summary: 'x' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
