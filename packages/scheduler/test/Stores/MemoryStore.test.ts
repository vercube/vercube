import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { runStoreContract } from './StoreContract';

runStoreContract('MemoryStore', async () => {
  const clock = new ManualClock('2026-01-01T00:00:00Z');
  const store = new MemoryStore();

  store.initialize({ clock });

  return {
    store,
    elapse: async (ms) => clock.set(clock.now() + ms),
  };
});

describe('MemoryStore', () => {
  it('is named and not distributed', () => {
    const store = new MemoryStore();

    expect(store.name).toBe('memory');
    expect(store.capabilities.distributed).toBe(false);
  });

  it('follows the clock of the manager unless one was given', async () => {
    const managerClock = new ManualClock('2026-01-01T00:00:00Z');
    const store = new MemoryStore();

    store.useClock(managerClock);
    await store.claim('key', 'a', 1000);
    managerClock.set('2026-01-01T00:00:02Z');

    expect(await store.claim('key', 'b', 1000)).toBe(true);
  });

  it('keeps an explicit clock over the manager clock', async () => {
    const own = new ManualClock('2026-01-01T00:00:00Z');
    const other = new ManualClock('2030-01-01T00:00:00Z');
    const store = new MemoryStore();

    store.initialize({ clock: own });
    store.useClock(other);
    await store.claim('key', 'a', 1000);

    expect(await store.claim('key', 'b', 1000)).toBe(false);
  });

  it('keeps its data when closed, so a store shared by several managers survives one of them', async () => {
    const store = new MemoryStore();

    await store.setState('job', { lastScheduledAt: 1, lastStartedAt: 1, lastOutcome: 'completed', lastInstance: 'a' });
    await store.close();

    expect(await store.getState('job')).not.toBeNull();
  });
});
