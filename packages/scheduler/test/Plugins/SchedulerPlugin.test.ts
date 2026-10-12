import { Container, initializeContainer } from '@vercube/di';
import { beforeEach, describe, expect, it } from 'vitest';
import { Every } from '../../src/Decorators/Every';
import { SchedulerPlugin } from '../../src/Plugins/SchedulerPlugin';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { defineSchedulerStore } from '../../src/Utils/Mount';
import type { App } from '@vercube/core';

const runs: string[] = [];

class Jobs {
  @Every('1m', { scope: 'instance' })
  public tick(): void {
    runs.push('tick');
  }
}

describe('SchedulerPlugin', () => {
  let container: Container;
  let app: App;
  let plugin: SchedulerPlugin;

  beforeEach(() => {
    runs.length = 0;
    container = new Container();
    container.bindInstance(Container, container);

    app = { container } as unknown as App;
    plugin = container.resolve(SchedulerPlugin);
  });

  it('should be named', () => {
    expect(plugin.name).toBe('SchedulerPlugin');
  });

  it('should bind the scheduler and mount the store', async () => {
    await plugin.use(app, { store: defineSchedulerStore({ store: MemoryStore }), autoStart: false });

    const manager = container.get(SchedulerManager);

    expect(manager).toBeInstanceOf(SchedulerManager);
    expect(manager.store).toBeInstanceOf(MemoryStore);
  });

  it('should apply the settings it is given', async () => {
    await plugin.use(app, { instanceId: 'pod-a', autoStart: false, defaults: { timezone: 'Europe/Warsaw' } });

    const manager = container.get(SchedulerManager);

    manager.add({ name: 'nightly', schedule: { cron: '0 3 * * *' }, scope: 'instance', handler: () => {} });

    expect(manager.instanceId).toBe('pod-a');
    expect(manager.list()[0].timezone).toBe('Europe/Warsaw');
  });

  it('should keep the scheduler and store of the first registration', async () => {
    const store = new MemoryStore();

    await plugin.use(app, { store: { store }, autoStart: false });

    const manager = container.get(SchedulerManager);

    await container.resolve(SchedulerPlugin).use(app, { store: { store: MemoryStore }, maxEvents: 5 });

    expect(container.get(SchedulerManager)).toBe(manager);
    expect(manager.store).toBe(store);
  });

  it('should start once the container is initialized', async () => {
    const clock = new ManualClock('2026-01-01T00:00:00Z');

    await plugin.use(app, { clock });
    container.bind(Jobs);
    initializeContainer(container);

    // the start lands in a microtask after the container flush
    await Promise.resolve();

    const manager = container.get(SchedulerManager);

    expect(manager.started).toBe(true);

    await clock.advance('1m');
    expect(runs).toEqual(['tick']);

    await manager.close();
  });

  it('should not start with autoStart off', async () => {
    const clock = new ManualClock('2026-01-01T00:00:00Z');

    await plugin.use(app, { clock, autoStart: false });
    container.bind(Jobs);
    initializeContainer(container);
    await Promise.resolve();
    await clock.advance('5m');

    expect(container.get(SchedulerManager).started).toBe(false);
    expect(runs).toEqual([]);
  });
});
