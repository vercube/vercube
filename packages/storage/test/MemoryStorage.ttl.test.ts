import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';

describe('MemoryStorage expiry', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    storage = new MemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expire a value written with a ttl', () => {
    storage.setItem('key', 'value', { ttl: 10 });

    vi.advanceTimersByTime(9999);
    expect(storage.getItem('key')).toBe('value');
    expect(storage.hasItem('key')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(storage.getItem('key')).toBeUndefined();
    expect(storage.hasItem('key')).toBe(false);
  });

  it('should keep a value written without a ttl, or with a ttl of zero', () => {
    storage.setItem('forever', 1);
    storage.setItem('zero', 2, { ttl: 0 });

    vi.advanceTimersByTime(365 * 24 * 3600 * 1000);

    expect(storage.getItems(['forever', 'zero'])).toEqual([1, 2]);
  });

  it('should drop the old expiry when a value is written again', () => {
    storage.setItem('key', 'short', { ttl: 1 });
    storage.setItem('key', 'long');

    vi.advanceTimersByTime(5000);

    expect(storage.getItem('key')).toBe('long');
  });

  it('should leave expired entries out of the keys, the size and multi reads', () => {
    storage.setItem('a', 1, { ttl: 1 });
    storage.setItem('b', 2);

    vi.advanceTimersByTime(1000);

    expect(storage.getKeys()).toEqual(['b']);
    expect(storage.size()).toBe(1);
    expect(storage.getItems(['a', 'b'])).toEqual([undefined, 2]);
  });

  it('should sweep expired entries nobody reads again on a later write', () => {
    for (let i = 0; i < 100; i++) {
      storage.setItem(`client:${i}`, i, { ttl: 1 });
    }

    vi.advanceTimersByTime(6000);
    storage.setItem('other', true);

    // reach into the map: getKeys() and size() sweep on their own
    expect((storage as unknown as { storage: Map<string, unknown> }).storage.size).toBe(1);
  });

  describe('increment', () => {
    it('should start a missing counter from zero and return the new value', () => {
      expect(storage.increment('hits')).toBe(1);
      expect(storage.increment('hits')).toBe(2);
      expect(storage.increment('hits', { by: 5 })).toBe(7);
      expect(storage.increment('hits', { by: -2 })).toBe(5);
      expect(storage.getItem('hits')).toBe(5);
    });

    it('should apply the ttl only when it creates the counter', () => {
      storage.increment('hits', { ttl: 10 });

      vi.advanceTimersByTime(9000);
      // a later ttl does not push the expiry forward
      expect(storage.increment('hits', { ttl: 10 })).toBe(2);

      vi.advanceTimersByTime(1000);
      expect(storage.getItem('hits')).toBeUndefined();
      expect(storage.increment('hits', { ttl: 10 })).toBe(1);
    });

    it('should restart a counter that holds something else than a number', () => {
      storage.setItem('hits', 'not a number');

      expect(storage.increment('hits')).toBe(1);
    });

    it('should not lose increments made concurrently', async () => {
      const results = await Promise.all(Array.from({ length: 50 }, async () => storage.increment('hits')));

      expect(new Set(results).size).toBe(50);
      expect(storage.getItem('hits')).toBe(50);
    });
  });
});
