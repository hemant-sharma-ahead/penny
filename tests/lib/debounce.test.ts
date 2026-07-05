import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '@/lib/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('invokes once with the latest args after the quiet window', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel() prevents a pending invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('x');
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() invokes the pending call immediately', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('y');
    d.flush();
    expect(fn).toHaveBeenCalledExactlyOnceWith('y');
  });
});
