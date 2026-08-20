import { describe, expect, it } from 'vitest';
import { QueueCollector } from '../../src/Services/QueueCollector';
import { createDevtoolsApp, devtoolsJson } from '../Utils/App';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';
import type { App } from '@vercube/core';

/**
 * Structural stand-in for `@vercube/queue`'s `QueueManager`.
 * Named and shaped so the collector finds it without importing the package.
 */
class QueueManager {
  public static snapshot: DevtoolsTypes.QueueSnapshot | null = null;

  public static configured: { capturePayloads?: boolean }[] = [];

  public static stats: Record<string, Record<string, number>> | null = null;

  public static statsError: Error | null = null;

  public static broken: boolean = false;

  public inspect(): DevtoolsTypes.QueueSnapshot {
    if (QueueManager.broken) {
      throw new Error('unreachable');
    }

    return QueueManager.snapshot!;
  }

  public configure(defaults: { capturePayloads?: boolean }): void {
    QueueManager.configured.push(defaults);
  }

  public async stats({ queue }: { queue: string; strategy?: string }): Promise<Record<string, number>> {
    if (QueueManager.statsError) {
      throw QueueManager.statsError;
    }

    return QueueManager.stats?.[queue] ?? {};
  }
}

/** A manager that predates the inspection API. */
class LegacyQueueManager {}

/**
 * Builds a snapshot with test friendly defaults.
 *
 * @param overrides fields to override
 * @returns a queue manager snapshot
 */
function snapshot(overrides: Partial<DevtoolsTypes.QueueSnapshot> = {}): DevtoolsTypes.QueueSnapshot {
  return {
    started: true,
    strategies: [
      {
        name: 'default',
        transport: 'memory',
        driver: 'MemoryStrategy',
        status: 'ready',
        capabilities: { retries: false, delay: true, priority: true, progress: true, stats: true },
      },
    ],
    consumers: [
      {
        strategy: 'default',
        queue: 'emails',
        job: 'welcome',
        source: 'EmailConsumer.welcome',
        attempts: 3,
        timeout: 5000,
        validated: true,
        running: true,
      },
    ],
    metrics: [
      {
        strategy: 'default',
        queue: 'emails',
        published: 4,
        processed: 3,
        failed: 1,
        retried: 1,
        unhandled: 0,
        active: 0,
        lastError: 'boom',
      },
    ],
    events: [
      {
        at: 1_700_000_000_000,
        strategy: 'default',
        queue: 'emails',
        job: 'welcome',
        id: 'job-1',
        attempt: 1,
        status: 'completed',
        duration: 12,
      },
    ],
    ...overrides,
  };
}

/**
 * Boots a devtools app with a fake queue manager already constructed.
 *
 * @param manager the manager class to bind, if any
 * @returns the running application
 */
async function createQueueApp(manager: typeof QueueManager | typeof LegacyQueueManager | null): Promise<App> {
  return createDevtoolsApp({}, (instance) => {
    if (!manager) {
      return;
    }

    // Prefer bind + get over bindInstance so hasInstance is true.
    instance.container.bind(manager);
    instance.container.get(manager);
  });
}

describe('QueueCollector', () => {
  it('reports nothing when the queue module is not in use', async () => {
    const app = await createQueueApp(null);
    const view = await app.container.get(QueueCollector).collect();

    expect(view).toEqual({ available: false, started: false, mounts: [], handlers: [], queues: [], events: [] });
  });

  it('reports nothing when the manager cannot be inspected', async () => {
    const app = await createQueueApp(LegacyQueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.available).toBe(false);
  });

  it('reports nothing when the manager fails to answer', async () => {
    QueueManager.broken = true;

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    QueueManager.broken = false;

    expect(view.available).toBe(false);
  });

  it('reports transports, handlers, queues and processed jobs', async () => {
    QueueManager.snapshot = snapshot();
    QueueManager.stats = { emails: { waiting: 2, active: 1 } };
    QueueManager.statsError = null;
    QueueManager.broken = false;

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.available).toBe(true);
    expect(view.started).toBe(true);
    expect(view.mounts[0]).toMatchObject({ name: 'default', transport: 'memory', status: 'ready' });
    expect(view.handlers[0]).toMatchObject({ job: 'welcome', source: 'EmailConsumer.welcome', validated: true });
    expect(view.queues[0]).toMatchObject({
      queue: 'emails',
      published: 4,
      processed: 3,
      failed: 1,
      lastError: 'boom',
      jobs: ['welcome'],
      running: true,
      stats: { waiting: 2, active: 1 },
    });
    expect(view.events[0]).toMatchObject({ job: 'welcome', status: 'completed' });
  });

  it('leaves the transport counters out when there are none', async () => {
    QueueManager.snapshot = snapshot();
    QueueManager.stats = {};
    QueueManager.statsError = null;

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.queues[0].stats).toBeNull();
  });

  it('survives a transport that cannot be reached', async () => {
    QueueManager.snapshot = snapshot();
    QueueManager.statsError = new Error('broker down');

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.queues[0].stats).toBeNull();
    expect(view.queues[0].queue).toBe('emails');
  });

  it('orders queues by strategy and name', async () => {
    QueueManager.statsError = null;
    QueueManager.stats = {};
    QueueManager.snapshot = snapshot({
      consumers: [],
      metrics: [
        { strategy: 'kafka', queue: 'events', published: 0, processed: 0, failed: 0, retried: 0, unhandled: 0, active: 0 },
        { strategy: 'default', queue: 'reports', published: 0, processed: 0, failed: 0, retried: 0, unhandled: 0, active: 0 },
        { strategy: 'default', queue: 'emails', published: 0, processed: 0, failed: 0, retried: 0, unhandled: 0, active: 0 },
      ],
    });

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.queues.map((queue) => `${queue.strategy}/${queue.queue}`)).toEqual([
      'default/emails',
      'default/reports',
      'kafka/events',
    ]);
  });

  it('reports a queue with no handler as idle', async () => {
    QueueManager.statsError = null;
    QueueManager.stats = {};
    QueueManager.snapshot = snapshot({ consumers: [] });

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.queues[0]).toMatchObject({ jobs: [], running: false });
  });

  it('asks the queue module to keep failure payloads, once', async () => {
    QueueManager.configured = [];
    QueueManager.statsError = null;
    QueueManager.stats = {};
    QueueManager.snapshot = snapshot();

    const app = await createQueueApp(QueueManager);
    const collector = app.container.get(QueueCollector);

    await collector.collect();
    await collector.collect();

    expect(QueueManager.configured).toEqual([{ capturePayloads: true }]);
  });

  it('reads a failure with its stack, payload and headers', async () => {
    QueueManager.configured = [];
    QueueManager.statsError = null;
    QueueManager.stats = {};
    QueueManager.snapshot = snapshot({
      events: [
        {
          at: 1_700_000_000_000,
          strategy: 'default',
          queue: 'emails',
          job: 'welcome',
          id: 'job-2',
          attempt: 2,
          status: 'failed',
          duration: 5,
          error: { name: 'TypeError', message: 'nope', stack: 'TypeError: nope\n    at handler', retryable: true },
          payload: '{ "userId": "u-1" }',
          headers: { authorization: '<redacted>' },
          source: 'EmailConsumer.welcome',
        },
      ],
    });

    const app = await createQueueApp(QueueManager);
    const view = await app.container.get(QueueCollector).collect();

    expect(view.events[0]).toMatchObject({
      status: 'failed',
      error: { name: 'TypeError', message: 'nope' },
      payload: '{ "userId": "u-1" }',
      headers: { authorization: '<redacted>' },
      source: 'EmailConsumer.welcome',
    });
    expect(view.events[0].error?.stack).toContain('at handler');
  });

  it('serves the same view over the api', async () => {
    QueueManager.statsError = null;
    QueueManager.stats = { emails: { waiting: 5 } };
    QueueManager.snapshot = snapshot();

    const app = await createQueueApp(QueueManager);
    const view = await devtoolsJson<DevtoolsTypes.QueueView>(app, '/_devtools/api/queues');

    expect(view.available).toBe(true);
    expect(view.queues[0].stats).toEqual({ waiting: 5 });
  });
});
