import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { QueueManager } from '@vercube/queue';
import { MemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { createLogger, outcomes } from '../Utils/Harness';
import type { SchedulerTypes } from '../../src/Types/SchedulerTypes';

/** A replica running both the scheduler and the queue. */
interface QueueReplica {
  scheduler: SchedulerManager;
  queue: QueueManager;
  strategy: MemoryStrategy;
  events: SchedulerTypes.RunEvent[];
}

describe('queue target', () => {
  let clock: ManualClock;
  let store: MemoryStore;
  let replicas: QueueReplica[];

  /**
   * Builds a replica: a container with a queue manager on its own in-memory
   * strategy, and a scheduler sharing the test's store.
   */
  async function createQueueReplica(instanceId: string, withQueue: boolean = true): Promise<QueueReplica> {
    const container = new Container();

    container.bindInstance(Container, container);
    container.bindInstance(Logger, createLogger());
    container.bind(SchedulerManager);

    if (withQueue) {
      container.bind(QueueManager);
    }

    const scheduler = container.get(SchedulerManager);
    const events: SchedulerTypes.RunEvent[] = [];

    scheduler.configure({ autoStart: false, clock, instanceId });
    scheduler.subscribe((event) => events.push(event));
    await scheduler.mount({ store });

    const queue = withQueue ? container.get(QueueManager) : (null as never);

    if (withQueue) {
      queue.configure({ autoStart: false });
      await queue.mount({ strategy: MemoryStrategy });
    }

    const replica = { scheduler, queue, strategy: withQueue ? (queue.getStrategy() as MemoryStrategy) : (null as never), events };

    replicas.push(replica);

    return replica;
  }

  beforeEach(() => {
    clock = new ManualClock('2026-01-01T00:00:30Z');
    store = new MemoryStore();
    replicas = [];
  });

  afterEach(async () => {
    for (const replica of replicas) {
      await replica.scheduler.close();
      await replica.queue?.close();
    }
  });

  it('enqueues every occurrence once across replicas, without running it', async () => {
    const handler = vi.fn();

    for (const instanceId of ['a', 'b']) {
      const replica = await createQueueReplica(instanceId);

      replica.scheduler.add({ name: 'reports.build', schedule: { every: '1m' }, target: { queue: 'reports' }, handler });
      await replica.scheduler.start();
    }

    await clock.advance('5m');

    const published = replicas
      .flatMap((replica) => replica.queue.inspect().metrics)
      .reduce((sum, metrics) => sum + metrics.published, 0);

    expect(published).toBe(5);
    expect(handler).not.toHaveBeenCalled();
    expect(outcomes(replicas.flatMap((replica) => replica.events))).toEqual({ enqueued: 5, 'skipped-claimed': 5 });
    expect(await store.getState('reports.build')).toMatchObject({ lastOutcome: 'enqueued' });
  });

  it('enqueues under a job id the transports accept', async () => {
    const replica = await createQueueReplica('a');
    const publish = vi.spyOn(replica.strategy, 'publish');

    replica.scheduler.add({ name: 'reports.build', schedule: { every: '1m' }, target: { queue: 'reports' }, handler: () => {} });
    await replica.scheduler.start();
    await clock.advance('1m');

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'reports',
        job: 'reports.build',
        payload: {
          name: 'reports.build',
          scheduledAt: '2026-01-01T00:01:00.000Z',
          occurrenceId: 'reports.build@2026-01-01T00:01:00.000Z',
        },
        options: expect.objectContaining({ jobId: 'reports.build@2026-01-01T00_01_00.000Z' }),
      }),
    );
  });

  it('runs the method on the worker with the context of the occurrence', async () => {
    const replica = await createQueueReplica('worker');
    const contexts: SchedulerTypes.JobContext[] = [];

    replica.scheduler.add({
      name: 'reports.build',
      schedule: { every: '1m' },
      target: { queue: 'reports' },
      handler: (ctx) => void contexts.push(ctx),
    });
    await replica.scheduler.start();
    await replica.queue.start();
    await clock.advance('1m');
    await replica.strategy.idle();
    await replica.scheduler.drain();

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      name: 'reports.build',
      occurrenceId: 'reports.build@2026-01-01T00:01:00.000Z',
      scheduledAt: new Date('2026-01-01T00:01:00Z'),
      trigger: 'queue',
      attempt: 1,
      instanceId: 'worker',
    });
    expect(outcomes(replica.events)).toEqual({ enqueued: 1, completed: 1 });
    expect(await store.getState('reports.build')).toMatchObject({ lastOutcome: 'completed', lastInstance: 'worker' });
  });

  it('lets the queue retry a failed run with its attempts', async () => {
    const replica = await createQueueReplica('worker');
    const attempts: number[] = [];

    replica.scheduler.add({
      name: 'reports.build',
      schedule: { every: '1h' },
      target: { queue: 'reports', attempts: 3 },
      retries: 5,
      handler: (ctx) => {
        attempts.push(ctx.attempt);

        if (ctx.attempt < 3) {
          throw new Error('flaky');
        }
      },
    });
    await replica.scheduler.start();
    await replica.queue.start();

    expect((await replica.scheduler.trigger('reports.build')).outcome).toBe('enqueued');

    for (let round = 0; round < 5 && attempts.length < 3; round++) {
      await replica.strategy.idle();
      await replica.queue.drain();
      await replica.scheduler.drain();
    }

    // the queue's attempts, the in-place retries are not stacked on top of them
    expect(attempts).toEqual([1, 2, 3]);
    expect(replica.scheduler.list()[0].target).toEqual({ queue: 'reports', strategy: 'default', attempts: 3 });
  });

  it('skips on the worker while another run of the job holds the lock', async () => {
    const replica = await createQueueReplica('worker');
    const handler = vi.fn();

    replica.scheduler.add({ name: 'reports.build', schedule: { every: '1h' }, target: { queue: 'reports' }, handler });
    await replica.scheduler.start();
    await replica.queue.start();
    await store.claim('active:reports.build', 'someone-else', 60_000);
    await replica.scheduler.trigger('reports.build');
    await replica.strategy.idle();
    await replica.scheduler.drain();

    expect(handler).not.toHaveBeenCalled();
    expect(outcomes(replica.events)).toEqual({ enqueued: 1, 'skipped-overlap': 1 });
  });

  it('records a failed enqueue', async () => {
    const replica = await createQueueReplica('a');

    vi.spyOn(replica.strategy, 'publish').mockRejectedValue(new Error('broker down'));
    replica.scheduler.add({ name: 'reports.build', schedule: { every: '1h' }, target: { queue: 'reports' }, handler: () => {} });
    await replica.scheduler.start();

    expect(await replica.scheduler.trigger('reports.build')).toMatchObject({
      outcome: 'failed',
      error: { name: 'SchedulerError', operation: 'enqueue' },
    });
    expect(await store.getState('reports.build')).toMatchObject({ lastOutcome: 'failed' });
  });

  it('refuses to start a queue target without a queue manager', async () => {
    const replica = await createQueueReplica('a', false);

    replica.scheduler.add({ name: 'reports.build', schedule: { every: '1m' }, target: { queue: 'reports' }, handler: () => {} });

    await expect(replica.scheduler.start()).rejects.toThrow(/target a queue, but no QueueManager is bound/);
    expect(replica.scheduler.started).toBe(false);
  });

  it('refuses a queue target with instance scope', async () => {
    const replica = await createQueueReplica('a');

    replica.scheduler.add({
      name: 'local',
      schedule: { every: '1m' },
      scope: 'instance',
      target: { queue: 'reports' },
      handler: () => {},
    });

    await expect(replica.scheduler.start()).rejects.toThrow(/A queue target needs cluster scope/);
  });

  it('rejects a malformed target', async () => {
    const replica = await createQueueReplica('a');

    expect(() =>
      replica.scheduler.add({ name: 'bad', schedule: { every: '1m' }, target: { queue: '' }, handler: () => {} }),
    ).toThrow(/Invalid target/);
    expect(() =>
      replica.scheduler.add({ name: 'worse', schedule: { every: '1m' }, target: 'elsewhere' as never, handler: () => {} }),
    ).toThrow(/Invalid target/);
  });

  it('registers the consumer of a job added at runtime and removes it with the job', async () => {
    const replica = await createQueueReplica('a');

    await replica.scheduler.start();
    replica.scheduler.add({ name: 'late', schedule: { every: '1m' }, target: { queue: 'reports' }, handler: () => {} });
    await replica.scheduler.drain();

    expect(replica.queue.inspect().consumers).toEqual([expect.objectContaining({ queue: 'reports', job: 'late' })]);

    replica.scheduler.remove('late');

    expect(replica.queue.inspect().consumers).toEqual([]);
  });

  it('reports inline jobs as inline', async () => {
    const replica = await createQueueReplica('a');

    replica.scheduler.add({ name: 'inline', schedule: { every: '1m' }, handler: () => {} });

    expect(replica.scheduler.list()[0].target).toBe('inline');
  });
});
