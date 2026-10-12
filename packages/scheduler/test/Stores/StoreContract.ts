import { describe, expect, it } from 'vitest';
import type { SchedulerStore } from '../../src/Services/SchedulerStore';

/** A store under test and a way to let its claims age. */
export interface StoreFixture {
  /** The initialized store. */
  store: SchedulerStore<unknown>;

  /** Lets `ms` milliseconds pass on the store's clock. */
  elapse(ms: number): Promise<void>;

  /** Releases whatever the fixture holds. */
  cleanup?(): Promise<void>;
}

/**
 * Runs the behaviour every store must have against one implementation.
 *
 * @param name - Name of the suite
 * @param factory - Creates a fresh, initialized store with a unique key space
 * @param ttl - Claim lifetime the expiry cases use, short enough to wait out on a real clock
 */
export function runStoreContract(name: string, factory: () => Promise<StoreFixture>, ttl: number = 200): void {
  describe(`${name} store contract`, () => {
    const withStore = (test: (fixture: StoreFixture) => Promise<void>) => async () => {
      const fixture = await factory();

      try {
        await test(fixture);
      } finally {
        await fixture.cleanup?.();
      }
    };

    it(
      'claims a free key',
      withStore(async ({ store }) => {
        expect(await store.claim('free', 'a', 60_000)).toBe(true);
      }),
    );

    it(
      'refuses a key someone holds, even to its owner',
      withStore(async ({ store }) => {
        await store.claim('held', 'a', 60_000);

        expect(await store.claim('held', 'b', 60_000)).toBe(false);
        expect(await store.claim('held', 'a', 60_000)).toBe(false);
      }),
    );

    it(
      'claims a key again once it expired',
      withStore(async ({ store, elapse }) => {
        await store.claim('expiring', 'a', ttl);
        await elapse(ttl * 2);

        expect(await store.claim('expiring', 'b', 60_000)).toBe(true);
      }),
    );

    it(
      'extends a claim for its owner only',
      withStore(async ({ store, elapse }) => {
        await store.claim('extended', 'a', ttl);

        expect(await store.extend('extended', 'b', 60_000)).toBe(false);
        expect(await store.extend('extended', 'a', 60_000)).toBe(true);

        await elapse(ttl * 2);

        expect(await store.claim('extended', 'b', 60_000)).toBe(false);
      }),
    );

    it(
      'does not extend an expired claim',
      withStore(async ({ store, elapse }) => {
        await store.claim('lapsed', 'a', ttl);
        await elapse(ttl * 2);

        expect(await store.extend('lapsed', 'a', 60_000)).toBe(false);
      }),
    );

    it(
      'releases a claim for its owner only',
      withStore(async ({ store }) => {
        await store.claim('released', 'a', 60_000);

        expect(await store.release('released', 'b')).toBe(false);
        expect(await store.claim('released', 'b', 60_000)).toBe(false);
        expect(await store.release('released', 'a')).toBe(true);
        expect(await store.claim('released', 'b', 60_000)).toBe(true);
      }),
    );

    it(
      'grants exactly one of many concurrent claims',
      withStore(async ({ store }) => {
        const results = await Promise.all(
          Array.from({ length: 50 }, (_, index) => store.claim('race', `owner-${index}`, 60_000)),
        );

        expect(results.filter(Boolean)).toHaveLength(1);
      }),
    );

    it(
      'round trips the state of a job',
      withStore(async ({ store }) => {
        expect(await store.getState('reports')).toBeNull();

        await store.setState('reports', {
          lastScheduledAt: 1000,
          lastStartedAt: 1005,
          lastFinishedAt: 1500,
          lastOutcome: 'failed',
          lastInstance: 'pod-a',
          lastError: 'boom',
        });

        expect(await store.getState('reports')).toEqual({
          lastScheduledAt: 1000,
          lastStartedAt: 1005,
          lastFinishedAt: 1500,
          lastOutcome: 'failed',
          lastInstance: 'pod-a',
          lastError: 'boom',
        });

        await store.setState('reports', {
          lastScheduledAt: 2000,
          lastStartedAt: 2000,
          lastOutcome: 'running',
          lastInstance: 'pod-b',
        });

        expect(await store.getState('reports')).toEqual({
          lastScheduledAt: 2000,
          lastStartedAt: 2000,
          lastOutcome: 'running',
          lastInstance: 'pod-b',
        });
      }),
    );
  });
}
