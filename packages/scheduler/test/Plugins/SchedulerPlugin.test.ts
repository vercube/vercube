import { MetadataResolver, ShutdownRegistry, StartupRegistry } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerCommand } from '../../src/Commands/SchedulerCommands';
import { SchedulerController } from '../../src/Controllers/SchedulerController';
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
  let shutdown: ShutdownRegistry;
  let startup: StartupRegistry;
  let plugin: SchedulerPlugin;

  beforeEach(() => {
    runs.length = 0;
    container = new Container();
    container.bindInstance(Container, container);
    container.bind(MetadataResolver);

    shutdown = new ShutdownRegistry();
    startup = new StartupRegistry();
    app = {
      container,
      onClose: (hook: () => Promise<void>) => shutdown.register(hook),
      onStart: (hook: () => Promise<void>) => startup.register(hook),
    } as unknown as App;
    plugin = container.resolve(SchedulerPlugin);
  });

  it('should be named', () => {
    expect(plugin.name).toBe('SchedulerPlugin');
  });

  it('should close the scheduler with the application, once', async () => {
    await plugin.use(app, { store: defineSchedulerStore({ store: MemoryStore }), autoStart: false });
    await container.resolve(SchedulerPlugin).use(app);

    const close = vi.spyOn(container.get(SchedulerManager), 'close');

    expect(shutdown.size).toBe(1);

    await shutdown.run();

    expect(close).toHaveBeenCalledOnce();
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

  it('should fail the boot when the scheduler cannot start', async () => {
    // a cluster job without a store cannot start
    await plugin.use(app, {});
    container.get(SchedulerManager).add({ name: 'report', schedule: { every: '1m' }, handler: () => {} });
    initializeContainer(container);

    await expect(startup.run()).rejects.toMatchObject({ name: 'SchedulerError' });
  });

  it('should start once, from the microtask and from the start hook', async () => {
    const clock = new ManualClock('2026-01-01T00:00:00Z');

    await plugin.use(app, { clock });
    container.bind(Jobs);
    initializeContainer(container);

    const manager = container.get(SchedulerManager);
    const start = vi.spyOn(manager, 'start');

    await startup.run();
    await Promise.resolve();

    expect(manager.started).toBe(true);
    expect(start).toHaveBeenCalledOnce();

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

  it('should mount the HTTP trigger at the configured path', async () => {
    await plugin.use(app, { autoStart: false, http: { secret: 's3cret', path: '/cron' } });

    expect(container.get(SchedulerController)).toBeInstanceOf(SchedulerController);
    expect(container.get(MetadataResolver).getControllerPath(SchedulerController)).toBe('/cron');

    // registered twice, the controller stays bound once
    await container.resolve(SchedulerPlugin).use(app, { http: { secret: 's3cret' } });
    expect(container.get(MetadataResolver).getControllerPath(SchedulerController)).toBe('/cron');
  });

  it('should refuse an HTTP trigger without a secret', async () => {
    await expect(plugin.use(app, { http: { secret: '' } })).rejects.toThrow(/needs a secret/);
    await expect(plugin.use(app, { http: {} as never })).rejects.toThrow(/needs a secret/);
  });

  it('should register the scheduler commands with the CLI', async () => {
    const registered: unknown[] = [];

    await plugin.setupCLI({
      cwd: process.cwd(),
      command: 'scheduler',
      config: {},
      register: (...commands: unknown[]) => registered.push(...commands),
    } as never);

    expect(registered).toEqual([SchedulerCommand]);
  });
});
