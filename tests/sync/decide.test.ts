import { describe, expect, it } from 'vitest';
import { decideSync } from '@/core/sync/decide';

const base = { canRun: true, remoteChanged: false, localDirty: false, dueDaily: false } as const;

describe('decideSync', () => {
  it('does nothing when it cannot run', () => {
    expect(decideSync({ ...base, target: 'google-drive', canRun: false, localDirty: true, dueDaily: true })).toEqual({
      pull: false,
      push: false,
      localSnapshot: false
    });
  });

  it('cloud: pulls when the remote changed', () => {
    expect(decideSync({ ...base, target: 'google-drive', remoteChanged: true })).toMatchObject({
      pull: true,
      push: false
    });
  });

  it('cloud: pushes when local is dirty or a daily backup is due', () => {
    expect(decideSync({ ...base, target: 'icloud', localDirty: true })).toMatchObject({ push: true });
    expect(decideSync({ ...base, target: 'icloud', dueDaily: true })).toMatchObject({ push: true });
  });

  it('cloud: idle when nothing changed and not due', () => {
    expect(decideSync({ ...base, target: 'google-drive' })).toEqual({ pull: false, push: false, localSnapshot: false });
  });

  it('local/none: takes an on-device snapshot when due or dirty, never pull/push', () => {
    expect(decideSync({ ...base, target: 'local', dueDaily: true })).toEqual({
      pull: false,
      push: false,
      localSnapshot: true
    });
    expect(decideSync({ ...base, target: null, localDirty: true })).toEqual({
      pull: false,
      push: false,
      localSnapshot: true
    });
    expect(decideSync({ ...base, target: null })).toEqual({ pull: false, push: false, localSnapshot: false });
  });
});
