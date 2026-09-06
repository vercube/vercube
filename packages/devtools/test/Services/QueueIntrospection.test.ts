import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueIntrospection } from '../../src/Services/QueueIntrospection';

const capabilities = { retries: false, delay: false, priority: false, progress: false, stats: true, peek: true };

class QueueManager {
  public configured: { capturePayloads?: boolean }[] = [];

  public peekError: Error | null = null;

  public statsError: Error | null = null;

  /** Whether the mounted transport reports the `peek` capability. */
  public peekable = true;

  public configure(defaults: { capturePayloads?: boolean }): void {
    this.configured.push(defaults);
  }

  public inspect(): unknown {
    return {
      started: true,
      strategies: [
        {
          name: 'default',
          transport: 'memory',
          driver: 'MemoryStrategy',
          status: 'ready',
          capabilities: { ...capabilities, peek: this.peekable },
        },
      ],
      consumers: [
        {
          strategy: 'default',
          queue: 'emails',
          job: 'welcome',
          source: 'C.welcome',
          attempts: 1,
          validated: false,
          running: true,
        },
        { strategy: 'default', queue: 'emails', job: 'digest', source: 'C.digest', attempts: 3, validated: true, running: true },
      ],
      metrics: [
        { strategy: 'default', queue: 'emails', published: 2, processed: 1, failed: 0, retried: 0, unhandled: 0, active: 0 },
      ],
      events: [
        { at: 1, strategy: 'default', queue: 'emails', job: 'welcome', id: 'j1', attempt: 1, status: 'completed', duration: 3 },
      ],
    };
  }

  public stats(): Promise<Record<string, number>> {
    if (this.statsError) {
      return Promise.reject(this.statsError);
    }

    return Promise.resolve({ waiting: 4 });
  }

  public peeked: { queue: string; strategy?: string; limit?: number }[] = [];

  public peek(params: { queue: string; strategy?: string; limit?: number }): Promise<unknown[]> {
    this.peeked.push(params);

    if (this.peekError) {
      return Promise.reject(this.peekError);
    }

    return Promise.resolve([{ id: 'j2', job: 'welcome', state: 'waiting', headers: {} }]);
  }
}

describe('QueueIntrospection', () => {
  let container: Container;
  let introspection: QueueIntrospection;

  beforeEach(() => {
    container = new Container();
    container.bind(QueueIntrospection);
    introspection = container.get(QueueIntrospection);
  });

  /**
   * Binds a manager and builds it, so the introspection can find it.
   *
   * @param type - Manager class to bind
   * @returns The built instance
   */
  function live(): QueueManager {
    container.bind(QueueManager);

    return container.get(QueueManager);
  }

  it('reports nothing when the application has no queue module', async () => {
    await expect(introspection.describe()).resolves.toEqual({
      available: false,
      started: false,
      mounts: [],
      handlers: [],
      queues: [],
      events: [],
    });
  });

  it('ignores a manager that is bound but never built', async () => {
    container.bind(QueueManager);

    // Resolving it would start consumers the application never asked for.
    await expect(introspection.describe()).resolves.toMatchObject({ available: false });
    expect(container.hasInstance(QueueManager)).toBe(false);
  });

  it('joins handlers, manager counters and transport counters per queue', async () => {
    live();

    const described = await introspection.describe();

    expect(described.available).toBe(true);
    expect(described.started).toBe(true);
    expect(described.mounts[0]).toMatchObject({ name: 'default', transport: 'memory' });
    expect(described.queues[0]).toMatchObject({
      queue: 'emails',
      published: 2,
      jobs: ['digest', 'welcome'],
      running: true,
      stats: { waiting: 4 },
      peekable: true,
    });
    expect(described.events).toHaveLength(1);
  });

  it('turns failure capture on once', async () => {
    const manager = live();

    await introspection.describe();
    await introspection.describe();

    expect(manager.configured).toEqual([{ capturePayloads: true }]);
  });

  it('reports no transport counters when the transport cannot answer', async () => {
    const manager = live();
    manager.statsError = new Error('broker down');

    const described = await introspection.describe();

    expect(described.queues[0].stats).toBeNull();
  });

  it('survives a manager that throws while being inspected', async () => {
    const manager = live();
    vi.spyOn(manager, 'inspect').mockImplementation(() => {
      throw new Error('nope');
    });

    await expect(introspection.describe()).resolves.toMatchObject({ available: false });
  });

  it('lists what a queue is holding', async () => {
    live();

    await expect(introspection.readMessages('emails', 'default', 10)).resolves.toMatchObject({
      peekable: true,
      messages: [{ id: 'j2', job: 'welcome' }],
    });
  });

  it('refuses to list a transport that cannot be read without consuming it', async () => {
    live().peekable = false;

    await expect(introspection.readMessages('emails', 'default', 10)).resolves.toMatchObject({
      peekable: false,
      messages: [],
      error: 'This transport cannot show a queue without consuming it.',
    });
  });

  it('refuses to list a queue this application never registered', async () => {
    const manager = live();

    // A transport reaches every queue sharing its connection, so without this an
    // inspector doubles as a reader of whatever else lives on that broker.
    await expect(introspection.readMessages('someone-elses-queue', 'default', 10)).resolves.toMatchObject({
      peekable: false,
      messages: [],
      error: 'No "someone-elses-queue" queue is registered on "default".',
    });
    expect(manager.peeked).toEqual([]);
  });

  it('caps how much of a queue one listing reads', async () => {
    const manager = live();

    await introspection.readMessages('emails', 'default', 100_000);

    expect(manager.peeked[0].limit).toBe(100);
  });

  it('reads at least one message when asked for nonsense', async () => {
    const manager = live();

    await introspection.readMessages('emails', 'default', 0);

    expect(manager.peeked[0].limit).toBe(1);
  });

  it('reports why a listing failed', async () => {
    const manager = live();
    manager.peekError = new Error('broker down');

    await expect(introspection.readMessages('emails', 'default', 10)).resolves.toMatchObject({
      peekable: true,
      error: 'broker down',
    });
  });

  it('says so when there is no queue module to list', async () => {
    await expect(introspection.readMessages('emails', 'default', 10)).resolves.toMatchObject({
      peekable: false,
      error: 'The queue module cannot be read.',
    });
  });
});
