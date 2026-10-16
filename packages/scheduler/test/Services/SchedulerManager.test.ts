import { Container, destroyContainer, initializeContainer } from '@vercube/di';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { MAX_TIMEOUT } from '../../src/Utils/Clock';
import { createReplica, outcomes } from '../Utils/Harness';
import type { SchedulerTypes } from '../../src/Types/SchedulerTypes';

const START = '2026-01-01T00:00:00Z';
const at = (iso: string): number => new Date(iso).getTime();

describe('SchedulerManager', () => {
  let clock: ManualClock;
  let store: MemoryStore;

  beforeEach(() => {
    clock = new ManualClock(START);
    store = new MemoryStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('registration', () => {
    it('rejects a duplicate name', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({ name: 'job', schedule: { every: '1m' }, scope: 'instance', handler: () => {}, source: 'A.job' });

      expect(() => manager.add({ name: 'job', schedule: { every: '1m' }, handler: () => {}, source: 'B.job' })).toThrow(
        /Job "job" is already registered/,
      );
    });

    it('rejects an invalid cron expression, time zone or option at registration', async () => {
      const { manager } = await createReplica({ clock });

      expect(() => manager.add({ name: 'bad-cron', schedule: { cron: 'nope' }, handler: () => {} })).toThrow(SchedulerError);
      expect(() =>
        manager.add({ name: 'bad-tz', schedule: { cron: '* * * * *', timezone: 'Nowhere/City' }, handler: () => {} }),
      ).toThrow(/Unknown time zone/);
      expect(() => manager.add({ name: 'bad-every', schedule: { every: '10ms' }, handler: () => {} })).toThrow(/shortest/);
      expect(() =>
        manager.add({ name: 'bad-scope', schedule: { every: '1m' }, scope: 'galaxy' as never, handler: () => {} }),
      ).toThrow(/Invalid scope/);
      expect(() => manager.add({ name: 'bad-ttl', schedule: { every: '1m' }, lockTtl: 10, handler: () => {} })).toThrow(
        /lockTtl/,
      );
      expect(() => manager.add({ name: 'bad-retries', schedule: { every: '1m' }, retries: 1.5, handler: () => {} })).toThrow(
        /retries/,
      );
      expect(() => manager.add({ name: '', schedule: { every: '1m' }, handler: () => {} })).toThrow(/needs a name/);
      expect(() => manager.add({ name: 'no-handler', schedule: { every: '1m' }, handler: undefined as never })).toThrow(
        /handler/,
      );
      expect(manager.list()).toEqual([]);
    });

    it('rejects invalid defaults', async () => {
      const { manager } = await createReplica({ clock });

      expect(() => manager.configure({ defaults: { timezone: 'Nowhere/City' } })).toThrow(/Unknown time zone/);
      expect(() => manager.configure({ defaults: { misfireGrace: 'soon' } })).toThrow(/Invalid duration/);
    });

    it('applies the configured defaults to jobs that do not set an option', async () => {
      const { manager } = await createReplica({ clock, defaults: { scope: 'instance', timezone: 'Europe/Warsaw' } });

      manager.add({ name: 'nightly', schedule: { cron: '0 3 * * *' }, handler: () => {} });
      manager.add({ name: 'utc', schedule: { cron: '0 3 * * *', timezone: 'UTC' }, scope: 'cluster', handler: () => {} });

      expect(manager.list()).toEqual([
        expect.objectContaining({
          name: 'nightly',
          scope: 'instance',
          timezone: 'Europe/Warsaw',
          kind: 'cron',
          schedule: '0 3 * * *',
        }),
        expect.objectContaining({ name: 'utc', scope: 'cluster', timezone: 'UTC' }),
      ]);
      expect(manager.nextRuns('nightly', 2)).toEqual([new Date('2026-01-01T02:00:00Z'), new Date('2026-01-02T02:00:00Z')]);
    });

    it('follows a default time zone configured after the job was added', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({ name: 'nightly', schedule: { cron: '0 3 * * *' }, handler: () => {} });
      manager.configure({ defaults: { timezone: 'Europe/Warsaw' } });

      expect(manager.nextRuns('nightly', 1)).toEqual([new Date('2026-01-01T02:00:00Z')]);
    });

    it('defaults to cluster scope, skip overlap and skip misfire', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({ name: 'job', schedule: { every: '5m' }, handler: () => {} });

      expect(manager.list()[0]).toMatchObject({
        scope: 'cluster',
        overlap: 'skip',
        misfire: 'skip',
        kind: 'every',
        schedule: 'every 5m',
        external: false,
        paused: false,
        running: 0,
        nextRun: new Date('2026-01-01T00:05:00Z'),
      });
    });

    it('throws for unknown jobs', async () => {
      const { manager } = await createReplica({ clock });

      expect(() => manager.pause('ghost')).toThrow(/No job is registered as "ghost"/);
      expect(() => manager.trigger('ghost')).toThrow(SchedulerError);
      expect(() => manager.nextRuns('ghost')).toThrow(SchedulerError);
      expect(() => manager.remove('ghost')).not.toThrow();
    });
  });

  describe('timers', () => {
    it('runs an instance job on every occurrence, with its context', async () => {
      const { manager } = await createReplica({ clock, instanceId: 'pod-a' });
      const contexts: SchedulerTypes.JobContext[] = [];

      manager.add({ name: 'tick', schedule: { every: '1m' }, scope: 'instance', handler: (ctx) => void contexts.push(ctx) });
      await manager.start();
      await clock.advance('3m');

      expect(contexts.map((ctx) => ctx.occurrenceId)).toEqual([
        'tick@2026-01-01T00:01:00.000Z',
        'tick@2026-01-01T00:02:00.000Z',
        'tick@2026-01-01T00:03:00.000Z',
      ]);
      expect(contexts[0]).toMatchObject({
        name: 'tick',
        scheduledAt: new Date('2026-01-01T00:01:00Z'),
        startedAt: new Date('2026-01-01T00:01:00Z'),
        trigger: 'timer',
        attempt: 1,
        instanceId: 'pod-a',
      });
      expect(contexts[0].signal.aborted).toBe(false);
      expect(contexts[0].logger).not.toBeNull();
    });

    it('does not run before start, nor while paused, nor external jobs', async () => {
      const { manager } = await createReplica({ clock });
      const runs: string[] = [];

      manager.add({ name: 'a', schedule: { every: '1m' }, scope: 'instance', handler: () => void runs.push('a') });
      manager.add({ name: 'b', schedule: { every: '1m' }, scope: 'instance', paused: true, handler: () => void runs.push('b') });
      manager.add({
        name: 'c',
        schedule: { every: '1m' },
        scope: 'instance',
        external: true,
        handler: () => void runs.push('c'),
      });

      await clock.advance('2m');
      expect(runs).toEqual([]);

      await manager.start();
      await clock.advance('1m');
      expect(runs).toEqual(['a']);

      manager.pause('a');
      manager.resume('b');
      await clock.advance('1m');
      expect(runs).toEqual(['a', 'b']);
      expect(manager.list().find((job) => job.name === 'c')?.nextRun).toBeNull();
    });

    it('arms a job added after start, and forgets a removed one', async () => {
      const { manager } = await createReplica({ clock });
      const runs: string[] = [];

      await manager.start();
      manager.add({ name: 'late', schedule: { every: '1m' }, scope: 'instance', handler: () => void runs.push('late') });
      await clock.advance('1m');
      manager.remove('late');
      await clock.advance('5m');

      expect(runs).toEqual(['late']);
    });

    it('computes the same occurrence ids on replicas started at different times', async () => {
      const a = await createReplica({ clock, instanceId: 'a' });
      const b = await createReplica({ clock, instanceId: 'b' });
      const ids: Record<string, string[]> = { a: [], b: [] };

      a.manager.add({
        name: 'sync',
        schedule: { every: '7s' },
        scope: 'instance',
        handler: (ctx) => void ids.a.push(ctx.occurrenceId),
      });
      b.manager.add({
        name: 'sync',
        schedule: { every: '7s' },
        scope: 'instance',
        handler: (ctx) => void ids.b.push(ctx.occurrenceId),
      });

      await clock.advance('3s');
      await a.manager.start();
      await clock.advance('11s');
      await b.manager.start();
      await clock.advance('30s');

      expect(ids.b.length).toBeGreaterThan(3);
      expect(ids.a).toEqual(expect.arrayContaining(ids.b));
      expect(ids.b.every((id) => new Date(id.split('@')[1]).getTime() % 7000 === 0)).toBe(true);
    });

    it('waits for occurrences further away than a single timer can, in chunks', async () => {
      // just after an occurrence, so the next one is a full 45 days away
      clock.set(Math.floor(at(START) / (45 * 86_400_000)) * 45 * 86_400_000 + 1000);

      const { manager } = await createReplica({ clock });
      const contexts: SchedulerTypes.JobContext[] = [];

      manager.add({ name: 'rare', schedule: { every: '45d' }, scope: 'instance', handler: (ctx) => void contexts.push(ctx) });

      const next = manager.nextRuns('rare', 1)[0];

      await manager.start();

      expect(clock.pending()).toEqual([new Date(clock.now() + MAX_TIMEOUT)]);

      await clock.advance(next.getTime() - clock.now() - 1);
      expect(contexts).toEqual([]);

      await clock.advance(1);
      expect(contexts).toHaveLength(1);
      expect(contexts[0].scheduledAt).toEqual(next);
      expect(contexts[0].startedAt).toEqual(next);
    });

    it('fires a skipped spring-forward time once', async () => {
      clock.set('2026-03-28T12:00:00Z');

      const { manager } = await createReplica({ clock });
      const runs: string[] = [];

      manager.add({
        name: 'dst',
        schedule: { cron: '30 2 * * *', timezone: 'Europe/Warsaw' },
        scope: 'instance',
        handler: (ctx) => void runs.push(ctx.scheduledAt.toISOString()),
      });
      await manager.start();
      await clock.advance('1d');

      expect(runs).toEqual(['2026-03-29T01:30:00.000Z']);
    });
  });

  describe('cluster runs', () => {
    it('runs every occurrence exactly once across replicas sharing a store', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const runs: string[] = [];

      for (const replica of [a, b]) {
        replica.manager.add({ name: 'report', schedule: { every: '1m' }, handler: (ctx) => void runs.push(ctx.occurrenceId) });
        await replica.manager.start();
      }

      await clock.advance('100m');

      expect(runs).toHaveLength(100);
      expect(new Set(runs).size).toBe(100);
      expect(outcomes([...a.events, ...b.events])).toEqual({ completed: 100, 'skipped-claimed': 100 });
    });

    it('does not run an occurrence again on a replica whose clock is behind', async () => {
      // mid-interval, so both replicas agree on the first occurrence
      clock.set('2026-01-01T00:00:30Z');
      store.initialize({ clock });

      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock: clock.skewed('-3s'), instanceId: 'b' }, store);
      const runs: string[] = [];

      for (const replica of [a, b]) {
        replica.manager.add({
          name: 'report',
          schedule: { every: '1m' },
          handler: async (ctx) => {
            runs.push(`${ctx.instanceId}:${ctx.occurrenceId}`);
            await clock.sleep(10);
          },
        });
        await replica.manager.start();
      }

      await clock.advance('5m');

      expect(runs).toHaveLength(5);
      expect(runs.every((run) => run.startsWith('a:'))).toBe(true);
      expect(outcomes(b.events)).toEqual({ 'skipped-claimed': 5 });
    });

    it('keeps the occurrence claimed for the whole jitter window', async () => {
      store.initialize({ clock });

      // replica a draws no jitter, replica b nearly the whole 10 minutes
      const draws = [0, 0.99];
      vi.spyOn(Math, 'random').mockImplementation(() => draws.shift() ?? 0.5);

      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const runs: string[] = [];

      for (const replica of [a, b]) {
        replica.manager.add({
          name: 'hourly',
          schedule: { cron: '0 * * * *' },
          jitter: '10m',
          handler: (ctx) => void runs.push(`${ctx.instanceId}:${ctx.occurrenceId}`),
        });
        await replica.manager.start();
      }

      await clock.advance('1h');
      await clock.advance('15m');

      expect(runs).toEqual(['a:hourly@2026-01-01T01:00:00.000Z']);
      expect(outcomes(b.events)).toEqual({ 'skipped-claimed': 1 });
    });

    it('does not run an occurrence another replica completed when a late replica misfires', async () => {
      store.initialize({ clock });

      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const runs: string[] = [];

      for (const replica of [a, b]) {
        replica.manager.add({
          name: 'hourly',
          schedule: { cron: '0 * * * *' },
          misfireGrace: '10s',
          misfire: 'run-once',
          handler: (ctx) => void runs.push(`${ctx.instanceId}:${ctx.occurrenceId}`),
        });
      }

      await a.manager.start();
      await clock.advance('1h');
      expect(runs).toEqual(['a:hourly@2026-01-01T01:00:00.000Z']);

      // b was frozen through the occurrence and wakes once its claim has expired
      clock.set('2026-01-01T01:20:00Z');
      await b.manager.start();
      const manager = b.manager as any;
      await manager.misfire(manager.fJobs.get('hourly'), at('2026-01-01T01:00:00Z'));

      expect(runs).toEqual(['a:hourly@2026-01-01T01:00:00.000Z']);
      expect(b.events).toEqual([expect.objectContaining({ outcome: 'skipped-claimed', trigger: 'misfire' })]);
    });

    it('records the state of a run in the store, including runs of other replicas', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);

      a.manager.add({ name: 'report', schedule: { every: '1m' }, handler: () => {} });
      b.manager.add({ name: 'report', schedule: { every: '1m' }, handler: () => {}, paused: true });
      await a.manager.start();
      await b.manager.start();
      await clock.advance('1m');

      expect(await b.manager.getStates()).toEqual({
        report: {
          lastScheduledAt: at('2026-01-01T00:01:00Z'),
          lastStartedAt: at('2026-01-01T00:01:00Z'),
          lastFinishedAt: at('2026-01-01T00:01:00Z'),
          lastOutcome: 'completed',
          lastInstance: 'a',
        },
      });
    });

    it('marks the state as running while a run is in flight, and keeps the error of a failed one', async () => {
      const { manager } = await createReplica({ clock, instanceId: 'a' }, store);

      manager.add({
        name: 'report',
        schedule: { every: '1m' },
        handler: async () => {
          await clock.sleep('10s');
          throw new Error('x'.repeat(5000));
        },
      });
      await manager.start();
      await clock.advance('1m');

      expect((await manager.getStates(['report'])).report).toMatchObject({ lastOutcome: 'running', lastInstance: 'a' });

      await clock.advance('10s');

      const state = (await manager.getStates(['report'])).report!;

      expect(state.lastOutcome).toBe('failed');
      expect(state.lastError).toHaveLength(1024);
    });

    it('does not run when the store cannot be reached', async () => {
      const { manager, events } = await createReplica({ clock }, store);
      const handler = vi.fn();

      manager.add({ name: 'report', schedule: { every: '1m' }, handler });
      await manager.start();
      vi.spyOn(store, 'claim').mockRejectedValue(new Error('connection refused'));
      await clock.advance('1m');

      expect(handler).not.toHaveBeenCalled();
      expect(events[0]).toMatchObject({ outcome: 'failed', error: { name: 'SchedulerError', operation: 'claim' } });
    });

    it('skips an occurrence while the previous run still holds the lock, across replicas', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      let running = 0;
      let peak = 0;

      for (const replica of [a, b]) {
        replica.manager.add({
          name: 'slow',
          schedule: { every: '1m' },
          handler: async () => {
            peak = Math.max(peak, ++running);
            await clock.sleep('90s');
            running--;
          },
        });
        await replica.manager.start();
      }

      await clock.advance('4m');

      const counted = outcomes([...a.events, ...b.events]);

      expect(peak).toBe(1);
      expect(counted['skipped-overlap']).toBeGreaterThan(0);
      expect(counted.completed).toBeGreaterThan(0);
    });

    it('lets runs overlap when overlap is allow, still once per occurrence', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const started: string[] = [];
      let running = 0;
      let peak = 0;

      for (const replica of [a, b]) {
        replica.manager.add({
          name: 'slow',
          schedule: { every: '1m' },
          overlap: 'allow',
          handler: async (ctx) => {
            started.push(ctx.occurrenceId);
            peak = Math.max(peak, ++running);
            await clock.sleep('90s');
            running--;
          },
        });
        await replica.manager.start();
      }

      await clock.advance('3m');

      expect(peak).toBe(2);
      expect(started).toHaveLength(3);
      expect(new Set(started).size).toBe(3);
    });

    it('keeps the lock of a long run alive with a heartbeat', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const handler = async (): Promise<void> => {
        await clock.sleep('2m');
      };

      a.manager.add({ name: 'long', schedule: { every: '1h' }, lockTtl: '30s', handler });
      b.manager.add({ name: 'long', schedule: { every: '1h' }, lockTtl: '30s', handler, paused: true });
      await a.manager.start();

      const extend = vi.spyOn(store, 'extend');
      const run = a.manager.trigger('long');

      await clock.advance('100s');

      // well past the 30s lifetime, the lock is still held
      b.manager.resume('long');
      expect((await b.manager.trigger('long', { force: true })).outcome).toBe('skipped-overlap');

      await clock.advance('20s');

      expect((await run).outcome).toBe('completed');
      expect(extend.mock.calls.length).toBeGreaterThanOrEqual(11);
      // released once the run is over
      expect(await store.claim('active:long', 'probe', 1000)).toBe(true);
    });

    it('aborts a run whose lock cannot be extended', async () => {
      const { manager } = await createReplica({ clock }, store);
      let signal: AbortSignal | undefined;

      manager.add({
        name: 'long',
        schedule: { every: '1h' },
        lockTtl: '30s',
        handler: async (ctx) => {
          signal = ctx.signal;
          await clock.sleep('2m');
        },
      });
      vi.spyOn(store, 'extend').mockResolvedValue(false);

      const run = manager.trigger('long');

      await clock.advance('15s');

      const result = await run;

      expect(signal?.aborted).toBe(true);
      expect(signal?.reason).toBeInstanceOf(SchedulerError);
      expect((signal!.reason as SchedulerError).operation).toBe('lock-lost');
      expect(result).toMatchObject({ outcome: 'aborted', error: { operation: 'lock-lost' } });
    });

    it('tolerates one failed heartbeat, and aborts on the second in a row', async () => {
      const { manager } = await createReplica({ clock }, store);
      const extend = vi.spyOn(store, 'extend');

      manager.add({
        name: 'long',
        schedule: { every: '1h' },
        lockTtl: '30s',
        handler: async (ctx) => {
          await clock.sleep('15s');
          ctx.signal.throwIfAborted();
          await clock.sleep('2m');
          ctx.signal.throwIfAborted();
        },
      });

      extend.mockRejectedValueOnce(new Error('blip'));

      const run = manager.trigger('long');

      await clock.advance('25s');
      expect(extend).toHaveBeenCalledTimes(2);

      extend.mockRejectedValue(new Error('down'));
      await clock.advance('30s');

      expect(await run).toMatchObject({ outcome: 'aborted', error: { operation: 'lock-lost' } });
    });

    it('does not start the handler when the run was aborted while its state was saved', async () => {
      const { manager } = await createReplica({ clock }, store);
      const handler = vi.fn();

      manager.add({ name: 'job', schedule: { every: '1h' }, timeout: '10s', handler });
      vi.spyOn(store, 'setState').mockImplementationOnce(() => clock.sleep('20s'));

      const run = manager.trigger('job');

      await clock.advance('20s');

      expect(await run).toMatchObject({ outcome: 'failed', attempts: 1, error: { operation: 'timeout' } });
      expect(handler).not.toHaveBeenCalled();
    });

    it('reports a handler failing on its own after losing its lock as failed', async () => {
      const { manager } = await createReplica({ clock }, store);

      manager.add({
        name: 'long',
        schedule: { every: '1h' },
        lockTtl: '30s',
        handler: async (ctx) => {
          await new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('rollback failed'))));
        },
      });
      vi.spyOn(store, 'extend').mockResolvedValue(false);

      const run = manager.trigger('long');

      await clock.advance('15s');

      expect(await run).toMatchObject({ outcome: 'failed', error: { message: 'rollback failed' } });
    });
  });

  describe('run policies', () => {
    it('aborts a run that outlives its timeout and records it as failed', async () => {
      const { manager } = await createReplica({ clock });
      let signal: AbortSignal | undefined;

      manager.add({
        name: 'slow',
        schedule: { every: '1h' },
        scope: 'instance',
        timeout: '10s',
        handler: async (ctx) => {
          signal = ctx.signal;
          await clock.sleep('1m');
        },
      });

      const run = manager.trigger('slow');

      await clock.advance('11s');

      const result = await run;

      expect((signal!.reason as SchedulerError).operation).toBe('timeout');
      expect(result).toMatchObject({ outcome: 'failed', attempts: 1, error: { operation: 'timeout' } });
      expect(result.durationMs).toBe(11_000);
    });

    it('settles a timed out handler that honours its signal right away', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({
        name: 'polite',
        schedule: { every: '1h' },
        scope: 'instance',
        timeout: '10s',
        handler: async (ctx) => {
          await new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason)));
        },
      });

      const run = manager.trigger('polite');

      await clock.advance('10s');

      expect(await run).toMatchObject({ outcome: 'failed', durationMs: 10_000, error: { operation: 'timeout' } });
    });

    it('retries a failed run in place', async () => {
      const { manager } = await createReplica({ clock });
      const attempts: number[] = [];

      manager.add({
        name: 'flaky',
        schedule: { every: '1h' },
        scope: 'instance',
        retries: 2,
        handler: (ctx) => {
          attempts.push(ctx.attempt);

          if (ctx.attempt < 3) {
            throw new Error('not yet');
          }
        },
      });

      expect(await manager.trigger('flaky')).toMatchObject({ outcome: 'completed', attempts: 3 });
      expect(attempts).toEqual([1, 2, 3]);
    });

    it('fails once the retries are used up', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({
        name: 'broken',
        schedule: { every: '1h' },
        scope: 'instance',
        retries: 1,
        handler: () => {
          throw 'plain string';
        },
      });

      expect(await manager.trigger('broken')).toMatchObject({
        outcome: 'failed',
        attempts: 2,
        error: { name: 'Error', message: 'plain string' },
      });
    });

    it('skips an instance occurrence while the previous local run is going, unless overlap is allow', async () => {
      const { manager, events } = await createReplica({ clock });

      manager.add({ name: 'skip', schedule: { every: '1m' }, scope: 'instance', handler: () => clock.sleep('90s') });
      manager.add({
        name: 'allow',
        schedule: { every: '1m' },
        scope: 'instance',
        overlap: 'allow',
        handler: () => clock.sleep('90s'),
      });
      await manager.start();
      await clock.advance('3m');

      // 00:01 runs until 00:02:30, 00:02 is skipped, 00:03 runs again
      expect(outcomes(events.filter((event) => event.name === 'skip'))).toEqual({ completed: 1, 'skipped-overlap': 1 });
      expect(manager.list().find((job) => job.name === 'skip')?.running).toBe(1);
      expect(manager.list().find((job) => job.name === 'allow')?.running).toBe(2);
    });

    it('waits a random jitter before claiming without changing the occurrence', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const { manager } = await createReplica({ clock });
      const contexts: SchedulerTypes.JobContext[] = [];

      manager.add({
        name: 'spread',
        schedule: { every: '1m' },
        scope: 'instance',
        jitter: '10s',
        handler: (ctx) => void contexts.push(ctx),
      });
      await manager.start();
      await clock.advance('1m');
      expect(contexts).toEqual([]);

      await clock.advance('5s');
      expect(contexts[0].scheduledAt).toEqual(new Date('2026-01-01T00:01:00Z'));
      expect(contexts[0].startedAt).toEqual(new Date('2026-01-01T00:01:05Z'));
    });

    it('records a late timer as missed when the misfire policy is skip', async () => {
      const { manager, events, logger } = await createReplica({ clock });
      const handler = vi.fn();

      manager.add({ name: 'job', schedule: { every: '1m' }, scope: 'instance', misfireGrace: '10s', handler });
      await manager.start();

      // the event loop was blocked for 30s past the occurrence
      clock.set('2026-01-01T00:01:30Z');
      await clock.advance();

      expect(handler).not.toHaveBeenCalled();
      expect(events).toEqual([
        expect.objectContaining({ outcome: 'missed', trigger: 'misfire', occurrenceId: 'job@2026-01-01T00:01:00.000Z' }),
      ]);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missed'));

      await clock.advance('30s');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('runs the latest late occurrence once when the misfire policy is run-once', async () => {
      const { manager, events } = await createReplica({ clock });

      manager.add({
        name: 'job',
        schedule: { every: '1m' },
        scope: 'instance',
        misfireGrace: '10s',
        misfire: 'run-once',
        handler: () => {},
      });
      await manager.start();

      // asleep through three occurrences
      clock.set('2026-01-01T00:03:30Z');
      await clock.advance();

      expect(events).toEqual([
        expect.objectContaining({ outcome: 'completed', trigger: 'misfire', occurrenceId: 'job@2026-01-01T00:03:00.000Z' }),
      ]);
    });

    it('runs a timer within its grace as on time', async () => {
      const { manager, events } = await createReplica({ clock });

      manager.add({ name: 'job', schedule: { every: '1m' }, scope: 'instance', misfireGrace: '10s', handler: () => {} });
      await manager.start();
      clock.set('2026-01-01T00:01:05Z');
      await clock.advance();

      expect(events).toEqual([expect.objectContaining({ outcome: 'completed', trigger: 'timer' })]);
    });
  });

  describe('startup catch-up', () => {
    const lastRun = (occurrence: string): SchedulerTypes.JobState => ({
      lastScheduledAt: at(occurrence),
      lastStartedAt: at(occurrence),
      lastFinishedAt: at(occurrence),
      lastOutcome: 'completed',
      lastInstance: 'old-pod',
    });

    it('runs only the latest missed occurrence, on one of the replicas starting together', async () => {
      clock.set('2026-01-01T00:03:20Z');
      await store.setState('report', lastRun('2026-01-01T00:00:00Z'));

      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const runs: SchedulerTypes.JobContext[] = [];

      for (const replica of [a, b]) {
        replica.manager.add({
          name: 'report',
          schedule: { every: '1m' },
          misfire: 'run-once',
          handler: (ctx) => void runs.push(ctx),
        });
      }

      await Promise.all([a.manager.start(), b.manager.start()]);
      await Promise.all([a.manager.drain(), b.manager.drain()]);

      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ trigger: 'misfire', occurrenceId: 'report@2026-01-01T00:03:00.000Z' });
      expect(outcomes([...a.events, ...b.events])).toEqual({ completed: 1, 'skipped-claimed': 1 });

      // and the timers carry on from there
      await clock.advance('40s');
      expect(runs.map((ctx) => ctx.occurrenceId)).toEqual(['report@2026-01-01T00:03:00.000Z', 'report@2026-01-01T00:04:00.000Z']);
    });

    it('does not catch up on a job that never ran, ran recently, or skips misfires', async () => {
      clock.set('2026-01-01T00:03:20Z');
      await store.setState('recent', lastRun('2026-01-01T00:03:00Z'));
      await store.setState('skipping', lastRun('2026-01-01T00:00:00Z'));
      await store.setState('ancient', lastRun('2025-12-01T00:00:00Z'));

      const { manager, events } = await createReplica({ clock }, store);

      manager.add({ name: 'fresh', schedule: { every: '1m' }, misfire: 'run-once', handler: () => {} });
      manager.add({ name: 'recent', schedule: { every: '1m' }, misfire: 'run-once', handler: () => {} });
      manager.add({ name: 'skipping', schedule: { every: '1m' }, handler: () => {} });
      manager.add({ name: 'ancient', schedule: { cron: '0 0 1 12 *' }, misfire: 'run-once', handler: () => {} });
      manager.add({ name: 'local', schedule: { every: '1m' }, scope: 'instance', misfire: 'run-once', handler: () => {} });
      await manager.start();
      await manager.drain();

      expect(events).toEqual([]);
    });
  });

  describe('fail-loud', () => {
    it('refuses to start cluster jobs without a store', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({ name: 'billing', schedule: { every: '1m' }, handler: () => {} });
      manager.add({ name: 'cache', schedule: { every: '1m' }, scope: 'instance', handler: () => {} });

      await expect(manager.start()).rejects.toThrow(/Cluster jobs "billing" need a store/);
      expect(manager.started).toBe(false);
    });

    it('refuses a cluster job added after start without a store', async () => {
      const { manager } = await createReplica({ clock });

      await manager.start();

      expect(() => manager.add({ name: 'billing', schedule: { every: '1m' }, handler: () => {} })).toThrow(/need a store/);
      expect(() => manager.add({ name: 'cache', schedule: { every: '1m' }, scope: 'instance', handler: () => {} })).not.toThrow();
    });

    it('refuses a manual trigger of a cluster job without a store', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({ name: 'billing', schedule: { every: '1m' }, handler: () => {} });

      expect(() => manager.trigger('billing')).toThrow(/need a store/);
    });

    it('refuses a local store in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const { manager } = await createReplica({ clock }, store);

      manager.add({ name: 'billing', schedule: { every: '1m' }, handler: () => {} });

      await expect(manager.start()).rejects.toThrow(/"memory" store, which only coordinates a single process/);
    });

    it('accepts a local store in production when allowLocalCluster is set', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const { manager } = await createReplica({ clock, allowLocalCluster: true }, store);

      manager.add({ name: 'billing', schedule: { every: '1m' }, handler: () => {} });

      await expect(manager.start()).resolves.toBeUndefined();
    });

    it('warns once about a local store outside production', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const { manager, logger } = await createReplica({ clock }, store);

      manager.add({ name: 'billing', schedule: { every: '1m' }, handler: () => {} });
      await manager.start();
      await manager.stop();
      await manager.start();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Fine for development'));
    });

    it('starts instance jobs without a store', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const { manager } = await createReplica({ clock });

      manager.add({ name: 'cache', schedule: { every: '1m' }, scope: 'instance', handler: () => {} });

      await expect(manager.start()).resolves.toBeUndefined();
    });

    it('keeps running instance jobs when the store fails to initialize', async () => {
      const { manager, logger, events } = await createReplica({ clock }, store);

      vi.spyOn(store, 'initialize').mockImplementation(() => {
        throw new Error('no route to host');
      });
      manager.add({ name: 'cache', schedule: { every: '1m' }, scope: 'instance', handler: () => {} });
      await manager.start();
      await clock.advance('1m');

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize store'), expect.any(Error));
      expect(events).toEqual([expect.objectContaining({ outcome: 'completed' })]);
      expect(manager.inspect().store).toMatchObject({ status: 'error', error: 'no route to host' });
    });
  });

  describe('stop', () => {
    it('waits for runs in flight and arms no timer afterwards', async () => {
      const { manager } = await createReplica({ clock }, store);
      const runs: string[] = [];

      manager.add({
        name: 'job',
        schedule: { every: '1m' },
        handler: async (ctx) => {
          await clock.sleep('10s');
          runs.push(ctx.occurrenceId);
        },
      });
      await manager.start();
      await clock.advance('1m');

      let stopped = false;
      const stopping = manager.stop({ timeout: 30_000 }).then(() => (stopped = true));

      await clock.advance('5s');
      expect(stopped).toBe(false);

      await clock.advance('5s');
      await stopping;
      expect(runs).toHaveLength(1);

      await clock.advance('10m');
      expect(runs).toHaveLength(1);
      expect(manager.started).toBe(false);
    });

    it('aborts runs still going at the timeout and releases their lock', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      let signal: AbortSignal | undefined;

      a.manager.add({
        name: 'job',
        schedule: { every: '1h' },
        handler: async (ctx) => {
          signal = ctx.signal;
          await clock.sleep('1h');
        },
      });
      b.manager.add({ name: 'job', schedule: { every: '1h' }, handler: () => {} });

      const run = a.manager.trigger('job');

      await clock.advance('1s');

      const stopping = a.manager.stop({ timeout: 5000 });

      await clock.advance('7s');
      await stopping;

      expect((signal!.reason as SchedulerError).operation).toBe('shutdown');
      expect(await run).toMatchObject({ outcome: 'aborted', error: { operation: 'shutdown' } });
      expect((await b.manager.trigger('job', { force: true })).outcome).toBe('completed');
    });

    it('uses the configured shutdown timeout and is idempotent', async () => {
      const { manager } = await createReplica({ clock, shutdownTimeout: '2s' });

      manager.add({ name: 'job', schedule: { every: '1h' }, scope: 'instance', handler: () => clock.sleep('1h') });

      const run = manager.trigger('job');

      await clock.advance(0);

      const first = manager.stop();
      const second = manager.stop();

      expect(second).toBe(first);

      await clock.advance('3s');
      await first;

      expect((await run).outcome).toBe('aborted');
      await expect(manager.stop()).resolves.toBeUndefined();
    });

    it('closes the store once it was used', async () => {
      const { manager } = await createReplica({ clock }, store);
      const close = vi.spyOn(store, 'close');

      await manager.close();
      expect(close).not.toHaveBeenCalled();

      manager.add({ name: 'job', schedule: { every: '1m' }, handler: () => {} });
      await manager.trigger('job');
      await manager.close();

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('stops on process signals when asked to', async () => {
      const once = vi.spyOn(process, 'once');
      const off = vi.spyOn(process, 'off');
      const { manager } = await createReplica({ clock, handleSignals: ['SIGUSR2'] });

      await manager.start();

      expect(once).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      expect(manager.started).toBe(true);

      (once.mock.calls[0][1] as () => void)();
      expect(manager.started).toBe(false);

      await manager.close();
      expect(off).toHaveBeenCalledWith('SIGUSR2', once.mock.calls[0][1]);
    });

    it('installs SIGTERM and SIGINT for handleSignals: true', async () => {
      const once = vi.spyOn(process, 'once').mockImplementation(() => process);
      const { manager } = await createReplica({ clock, handleSignals: true });

      await manager.start();
      await manager.start();

      expect(once.mock.calls.map((call) => call[0])).toEqual(['SIGTERM', 'SIGINT']);

      await manager.close();
    });
  });

  describe('trigger', () => {
    it('runs a job now under an occurrence of its own', async () => {
      const { manager } = await createReplica({ clock }, store);
      const contexts: SchedulerTypes.JobContext[] = [];

      manager.add({ name: 'job', schedule: { every: '1h' }, handler: (ctx) => void contexts.push(ctx) });

      const first = await manager.trigger('job');

      await clock.advance('1s');

      const second = await manager.trigger('job');

      expect(first).toMatchObject({ outcome: 'completed', occurrenceId: `job@manual:${at(START)}`, attempts: 1 });
      expect(second.outcome).toBe('completed');
      expect(contexts.map((ctx) => ctx.trigger)).toEqual(['manual', 'manual']);
    });

    it('claims a given occurrence so replicas triggering it together run it once', async () => {
      const a = await createReplica({ clock, instanceId: 'a' }, store);
      const b = await createReplica({ clock, instanceId: 'b' }, store);
      const handler = vi.fn();
      const scheduledAt = new Date('2026-01-01T00:00:00Z');

      a.manager.add({ name: 'job', schedule: { every: '1h' }, handler });
      b.manager.add({ name: 'job', schedule: { every: '1h' }, handler });

      const results = await Promise.all([
        a.manager.trigger('job', { scheduledAt, source: 'external' }),
        b.manager.trigger('job', { scheduledAt, source: 'external' }),
      ]);

      expect(results.map((result) => result.outcome).sort()).toEqual(['completed', 'skipped-claimed']);
      expect(results[0].occurrenceId).toBe('job@2026-01-01T00:00:00.000Z');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({ trigger: 'external', scheduledAt });

      expect((await b.manager.trigger('job', { scheduledAt, force: true })).outcome).toBe('completed');
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('skips a paused job', async () => {
      const { manager } = await createReplica({ clock });
      const handler = vi.fn();

      manager.add({ name: 'job', schedule: { every: '1h' }, scope: 'instance', paused: true, handler });

      expect(await manager.trigger('job')).toMatchObject({ outcome: 'skipped-paused', attempts: 0 });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('inspection', () => {
    it('describes the jobs, the store and the recent events', async () => {
      const { manager } = await createReplica({ clock, instanceId: 'pod-a', maxEvents: 2 }, store);

      manager.add({ name: 'a', schedule: { every: '1m' }, handler: () => {}, source: 'Jobs.a' });
      await manager.start();
      await clock.advance('3m');

      const snapshot = manager.inspect();

      expect(snapshot).toMatchObject({
        started: true,
        instanceId: 'pod-a',
        store: { name: 'memory', distributed: false, status: 'ready' },
        jobs: [
          {
            name: 'a',
            source: 'Jobs.a',
            nextRun: new Date('2026-01-01T00:04:00Z'),
            lastRun: { outcome: 'completed', occurrenceId: 'a@2026-01-01T00:03:00.000Z', instanceId: 'pod-a' },
          },
        ],
      });
      expect(snapshot.events.map((event) => event.occurrenceId)).toEqual([
        'a@2026-01-01T00:03:00.000Z',
        'a@2026-01-01T00:02:00.000Z',
      ]);
    });

    it('reports no store and no state when none is mounted', async () => {
      const { manager } = await createReplica({ clock });

      manager.add({ name: 'a', schedule: { every: '1m' }, scope: 'instance', handler: () => {} });

      expect(manager.inspect().store).toBeNull();
      expect(await manager.getStates()).toEqual({ a: null });
      expect(manager.store).toBeUndefined();
    });

    it('creates an instance id from the host name when none is given', async () => {
      vi.stubEnv('HOSTNAME', 'api-7d9f');

      const { manager } = await createReplica({ clock });

      expect(manager.instanceId).toMatch(new RegExp(`^api-7d9f-${process.pid}-[0-9a-f]{4}$`));
    });

    it('keeps listeners that throw', async () => {
      const { manager, logger } = await createReplica({ clock, maxEvents: 0 });
      const listener = vi.fn(() => {
        throw new Error('listener');
      });

      manager.add({ name: 'a', schedule: { every: '1m' }, scope: 'instance', handler: () => {} });
      manager.subscribe(listener);
      await manager.trigger('a');
      await manager.trigger('a');

      expect(listener).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith('Vercube/SchedulerManager::Run listener threw', expect.any(Error));
      expect(manager.inspect().events).toEqual([]);
    });

    it('reports the occurrence its schedule is at', async () => {
      clock.set('2026-01-01T03:00:02Z');

      const { manager } = await createReplica({ clock });

      manager.add({ name: 'nightly', schedule: { cron: '0 3 * * *' }, scope: 'instance', handler: () => {} });
      manager.add({ name: 'every', schedule: { every: '1h' }, scope: 'instance', handler: () => {} });

      expect(manager.currentOccurrence('nightly')).toEqual(new Date('2026-01-01T03:00:00Z'));
      expect(manager.currentOccurrence('every')).toEqual(new Date('2026-01-01T03:00:00Z'));
    });

    it('registers itself for the CLI and forgets itself once closed', async () => {
      const { manager, container } = await createReplica({ clock });
      const { liveManagers } = await import('../../src/Utils/Registry');

      initializeContainer(container);
      expect(liveManagers()).toContain(manager);

      await manager.close();
      expect(liveManagers()).not.toContain(manager);
    });

    it('never starts on its own when the CLI turned timers off', async () => {
      vi.stubEnv('VERCUBE_SCHEDULER_AUTOSTART', 'false');

      const { manager, container } = await createReplica({ clock, autoStart: true });

      initializeContainer(container);
      await Promise.resolve();

      expect(manager.started).toBe(false);
    });

    it('stops notifying an unsubscribed listener', async () => {
      const { manager } = await createReplica({ clock });
      const listener = vi.fn();

      manager.add({ name: 'a', schedule: { every: '1m' }, scope: 'instance', handler: () => {} });
      manager.subscribe(listener)();
      await manager.trigger('a');

      expect(listener).not.toHaveBeenCalled();
    });
  });
  describe('failure handling', () => {
    it('arms nothing and catches up on nothing when stopped while the store connects', async () => {
      clock.set('2026-01-01T00:03:20Z');
      await store.setState('job', {
        lastScheduledAt: at('2026-01-01T00:00:00Z'),
        lastStartedAt: at('2026-01-01T00:00:00Z'),
        lastOutcome: 'completed',
        lastInstance: 'old-pod',
      });

      const { manager, events } = await createReplica({ clock }, store);
      let connected!: () => void;

      vi.spyOn(store, 'initialize').mockImplementation(() => new Promise<void>((resolve) => (connected = resolve)));
      manager.add({ name: 'job', schedule: { every: '1m' }, misfire: 'run-once', handler: () => {} });

      const starting = manager.start();

      await Promise.resolve();
      await manager.stop();
      connected();
      await starting;
      await manager.drain();

      expect(events).toEqual([]);
      expect(clock.pending()).toEqual([]);
    });

    it('connects a store mounted after start', async () => {
      const { manager } = await createReplica({ clock });
      const initialize = vi.spyOn(store, 'initialize');

      await manager.start();
      await manager.mount({ store });

      expect(initialize).toHaveBeenCalledTimes(1);
      expect(manager.inspect().store?.status).toBe('ready');
    });

    it('logs a store failing to close', async () => {
      const { manager, logger } = await createReplica({ clock }, store);

      vi.spyOn(store, 'close').mockRejectedValue(new Error('already gone'));
      await manager.getStates();
      await manager.close();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to close store'), expect.any(Error));
    });

    it('logs failures to read or write state and to release a lock, and keeps going', async () => {
      clock.set('2026-01-01T00:03:20Z');

      const { manager, logger } = await createReplica({ clock }, store);

      vi.spyOn(store, 'getState').mockRejectedValue(new Error('read'));
      vi.spyOn(store, 'setState').mockRejectedValue(new Error('write'));
      vi.spyOn(store, 'release').mockRejectedValue(new Error('release'));
      manager.add({ name: 'job', schedule: { every: '1m' }, misfire: 'run-once', handler: () => {} });
      await manager.start();
      await manager.drain();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read the state'), expect.any(Error));

      expect((await manager.trigger('job')).outcome).toBe('completed');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to save the state'), expect.any(Error));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to release the lock'), expect.any(Error));
    });

    it('leaves an occurrence to the other replicas when stopped during its jitter', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const { manager, events } = await createReplica({ clock });
      const handler = vi.fn();

      manager.add({ name: 'spread', schedule: { every: '1m' }, scope: 'instance', jitter: '10s', handler });
      await manager.start();
      await clock.advance('1m');

      const stopping = manager.stop({ timeout: 60_000 });

      await clock.advance('5s');
      await stopping;

      expect(handler).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    });

    it('stops computing occurrences of a schedule that has none left', async () => {
      clock.set('2026-03-01T00:00:00Z');

      const { manager } = await createReplica({ clock });

      manager.add({ name: 'leap', schedule: { cron: '0 0 30 2 *' }, scope: 'instance', handler: () => {} });
      await manager.start();

      expect(manager.nextRuns('leap')).toEqual([]);
      expect(manager.list()[0].nextRun).toBeNull();
      expect(clock.pending()).toEqual([]);
    });

    it('warns on the console when no logger is bound', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const container = new Container();

      container.bindInstance(Container, container);
      container.bind(SchedulerManager);

      const manager = container.get(SchedulerManager);

      manager.configure({ autoStart: false, clock });
      await manager.mount({ store });
      manager.add({ name: 'job', schedule: { every: '1m' }, handler: () => {} });
      await manager.start();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Fine for development'));
    });

    it('closes when its container is destroyed', async () => {
      const { manager, container } = await createReplica({ clock }, store);
      const close = vi.spyOn(manager, 'close');

      initializeContainer(container);
      destroyContainer(container);

      expect(close).toHaveBeenCalled();
    });

    it('logs a failed automatic start', async () => {
      const { manager, logger } = await createReplica({ clock });

      vi.spyOn(manager, 'start').mockRejectedValue(new Error('boom'));
      manager.configure({ autoStart: true });
      (manager as unknown as { init: () => void }).init();
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith('Vercube/SchedulerManager::Failed to start', expect.any(Error));
    });

    it('stops on Deno signals', async () => {
      const listeners = new Map<string, () => void>();
      const removeSignalListener = vi.fn();

      vi.stubGlobal('Deno', {
        addSignalListener: (signal: string, fn: () => void) => listeners.set(signal, fn),
        removeSignalListener,
      });

      const { manager } = await createReplica({ clock, handleSignals: true });

      await manager.start();
      expect([...listeners.keys()]).toEqual(['SIGTERM', 'SIGINT']);

      listeners.get('SIGTERM')!();
      expect(manager.started).toBe(false);

      await manager.close();
      expect(removeSignalListener).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });
  });
});
