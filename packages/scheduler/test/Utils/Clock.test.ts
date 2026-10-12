import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TIMEOUT, sleep, SystemClock } from '../../src/Utils/Clock';

describe('SystemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the system time', () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });

    expect(SystemClock.now()).toBe(Date.UTC(2026, 0, 1));
  });

  it('fires and cancels timers, capped at the longest wait a timer can take', () => {
    vi.useFakeTimers();

    const fired = vi.fn();
    const capped = vi.fn();
    const cancelled = vi.fn();

    SystemClock.setTimeout(fired, 100);
    SystemClock.setTimeout(capped, MAX_TIMEOUT * 2);
    SystemClock.clearTimeout(SystemClock.setTimeout(cancelled, 100));

    vi.advanceTimersByTime(100);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MAX_TIMEOUT);
    expect(capped).toHaveBeenCalledTimes(1);
  });

  it('keeps its timers referenced, so a scheduler-only process stays alive until the next occurrence', () => {
    const handle = SystemClock.setTimeout(() => {}, 1000) as ReturnType<typeof setTimeout>;

    expect(handle.hasRef()).toBe(true);
    SystemClock.clearTimeout(handle);
  });

  it('sleeps on a clock', async () => {
    vi.useFakeTimers();

    const done = vi.fn();

    void sleep(SystemClock, 50).then(done);
    await vi.advanceTimersByTimeAsync(50);

    expect(done).toHaveBeenCalled();
  });
});
