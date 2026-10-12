import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it } from 'vitest';
import { SchedulerIntrospection } from '../../src/Services/SchedulerIntrospection';

/** Stand-in with the public surface of `@vercube/scheduler`'s manager. */
class SchedulerManager {
  public stateError: Error | null = null;

  public triggerError: Error | null = null;

  public withStore = true;

  public triggered: string[] = [];

  public inspect(): unknown {
    return {
      started: true,
      instanceId: 'pod-a',
      store: this.withStore ? { name: 'redis', distributed: true, status: 'ready' } : null,
      jobs: [
        {
          name: 'billing.close-day',
          source: 'BillingJobs.closeDay',
          kind: 'cron',
          schedule: '0 3 * * *',
          timezone: 'Europe/Warsaw',
          scope: 'cluster',
          overlap: 'skip',
          misfire: 'run-once',
          target: 'inline',
          external: false,
          paused: false,
          running: 0,
          nextRun: new Date('2026-01-02T02:00:00Z'),
        },
        {
          name: 'cache.flush',
          source: 'CacheJobs.flush',
          kind: 'every',
          schedule: 'every 5m',
          scope: 'instance',
          overlap: 'skip',
          misfire: 'skip',
          target: 'inline',
          external: false,
          paused: true,
          running: 0,
          nextRun: null,
        },
      ],
      events: [
        {
          name: 'cache.flush',
          occurrenceId: 'cache.flush@2026-01-01T00:05:00.000Z',
          scheduledAt: '2026-01-01T00:05:00.000Z',
          outcome: 'completed',
          attempts: 1,
          durationMs: 2,
          trigger: 'timer',
          instanceId: 'pod-a',
          at: 1,
        },
      ],
    };
  }

  public async getStates(names: string[]): Promise<Record<string, unknown>> {
    if (this.stateError) {
      throw this.stateError;
    }

    return Object.fromEntries(
      names.map((name) => [
        name,
        name === 'billing.close-day'
          ? { lastScheduledAt: 1, lastStartedAt: 2, lastFinishedAt: 3, lastOutcome: 'completed', lastInstance: 'pod-b' }
          : null,
      ]),
    );
  }

  public async trigger(name: string): Promise<unknown> {
    this.triggered.push(name);

    if (this.triggerError) {
      throw this.triggerError;
    }

    return name === 'billing.close-day'
      ? { outcome: 'completed', occurrenceId: `${name}@manual:1`, durationMs: 4 }
      : { outcome: 'failed', occurrenceId: `${name}@manual:1`, durationMs: 1, error: { message: 'boom' } };
  }
}

describe('SchedulerIntrospection', () => {
  let container: Container;
  let introspection: SchedulerIntrospection;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);
    container.bind(SchedulerIntrospection);
    introspection = container.get(SchedulerIntrospection);
  });

  /** Binds and instantiates the stand-in, the way the application would. */
  function bindManager(): SchedulerManager {
    container.bind(SchedulerManager);

    return container.get(SchedulerManager);
  }

  it('reports the scheduler as unavailable when none is live', async () => {
    expect(introspection.id).toBe('scheduler');
    expect(introspection.title).toBe('Scheduler');
    expect(introspection.revision()).toBeGreaterThan(0);

    // bound but never instantiated: an inspector must not construct it
    container.bind(SchedulerManager);

    expect(await introspection.describe()).toEqual({
      available: false,
      started: false,
      instanceId: '',
      store: null,
      jobs: [],
      events: [],
    });
  });

  it('describes the jobs, joined with what the store remembers of the cluster', async () => {
    bindManager();

    const description = await introspection.describe();

    expect(description).toMatchObject({
      available: true,
      started: true,
      instanceId: 'pod-a',
      store: { name: 'redis', distributed: true, status: 'ready' },
      events: [expect.objectContaining({ name: 'cache.flush', outcome: 'completed' })],
    });
    expect(description.jobs[0]).toMatchObject({
      name: 'billing.close-day',
      nextRun: '2026-01-02T02:00:00.000Z',
      cluster: { lastOutcome: 'completed', lastInstance: 'pod-b' },
    });
    expect(description.jobs[1]).toMatchObject({ name: 'cache.flush', nextRun: null, cluster: null });
  });

  it('reads no cluster state without a store, and explains a store that fails', async () => {
    const manager = bindManager();

    manager.withStore = false;
    expect((await introspection.describe()).jobs.every((job) => job.cluster === null)).toBe(true);

    manager.withStore = true;
    manager.stateError = new Error('ECONNREFUSED');

    const description = await introspection.describe();

    expect(description.stateError).toBe('ECONNREFUSED');
    expect(description.jobs[0].cluster).toBeNull();
  });

  it('runs a job and reports how it ended', async () => {
    const manager = bindManager();

    expect(await introspection.run('billing.close-day')).toEqual({
      outcome: 'completed',
      occurrenceId: 'billing.close-day@manual:1',
      durationMs: 4,
    });
    expect(await introspection.run('cache.flush')).toMatchObject({ outcome: 'failed', error: 'boom' });

    manager.triggerError = new Error('No store');
    expect(await introspection.run('billing.close-day')).toEqual({ error: 'No store' });
  });

  it('only runs jobs the application declared', async () => {
    const manager = bindManager();

    expect(await introspection.run('../../etc')).toEqual({ error: 'No job is registered as "../../etc".' });
    expect(manager.triggered).toEqual([]);
  });

  it('refuses to run anything without a scheduler', async () => {
    expect(await introspection.run('billing.close-day')).toEqual({ error: 'The scheduler is not in use.' });
  });

  it('tolerates a manager that fails to describe itself', async () => {
    const manager = bindManager();

    manager.inspect = () => {
      throw new Error('broken');
    };

    expect((await introspection.describe()).available).toBe(false);
  });
});
