import { HealthRegistry, ShutdownRegistry } from '@vercube/core';
import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueuePlugin } from '../../src/Plugins/QueuePlugin';
import { QueueManager } from '../../src/Services/QueueManager';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { RecordingStrategy } from '../Utils/Mock.mock';
import type { App } from '@vercube/core';

describe('QueuePlugin', () => {
  let container: Container;
  let app: App;
  let shutdown: ShutdownRegistry;
  let plugin: QueuePlugin;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);

    shutdown = new ShutdownRegistry();
    app = {
      container,
      health: new HealthRegistry(),
      onClose: (hook: () => Promise<void>) => shutdown.register(hook),
    } as unknown as App;
    plugin = container.resolve(QueuePlugin);
  });

  it('should be named', () => {
    expect(plugin.name).toBe('QueuePlugin');
  });

  it('should close the queue with the application, once', async () => {
    await plugin.use(app, { strategies: [{ strategy: MemoryStrategy }] });
    await container.resolve(QueuePlugin).use(app);

    const close = vi.spyOn(container.get(QueueManager), 'close');

    expect(shutdown.size).toBe(1);

    await shutdown.run();

    expect(close).toHaveBeenCalledOnce();
  });

  it('should bind the queue manager', async () => {
    await plugin.use(app);

    expect(container.get(QueueManager)).toBeInstanceOf(QueueManager);
  });

  it('should mount every configured strategy', async () => {
    await plugin.use(app, {
      strategies: [
        { strategy: MemoryStrategy },
        { name: 'recording', strategy: RecordingStrategy, initOptions: { label: 'recording' } },
      ],
    });

    const manager = container.get(QueueManager);

    expect(manager.getStrategy()).toBeInstanceOf(MemoryStrategy);
    expect(manager.getStrategy('recording')).toBeInstanceOf(RecordingStrategy);
  });

  it('should apply the manager settings it is given', async () => {
    await plugin.use(app, { autoStart: false, concurrency: 8, onUnhandled: 'fail', maxEvents: 10 });

    expect(container.get(QueueManager).defaults).toMatchObject({
      autoStart: false,
      concurrency: 8,
      onUnhandled: 'fail',
      maxEvents: 10,
    });
  });

  describe('registered twice', () => {
    it('should keep the settings and strategies of the first registration', async () => {
      // the plugin ends up registered twice as soon as it is listed both in the
      // config and in app.addPlugin(), which used to reset the manager
      await plugin.use(app, { maxEvents: 200, strategies: [{ strategy: MemoryStrategy }] });

      const manager = container.get(QueueManager);
      const mounted = manager.getStrategy();

      await container.resolve(QueuePlugin).use(app, { strategies: [{ name: 'second', strategy: RecordingStrategy }] });

      expect(container.get(QueueManager)).toBe(manager);
      expect(manager.defaults.maxEvents).toBe(200);
      expect(manager.getStrategy()).toBe(mounted);
      expect(manager.getStrategy('second')).toBeInstanceOf(RecordingStrategy);
    });

    it('should keep registered handlers alive', async () => {
      await plugin.use(app, { strategies: [{ strategy: MemoryStrategy }] });

      const manager = container.get(QueueManager);

      manager.registerConsumer({
        strategy: 'default',
        queue: 'emails',
        job: 'welcome',
        handler: async () => undefined,
        options: {},
        source: 'Test.welcome',
      });

      await container.resolve(QueuePlugin).use(app, { strategies: [{ strategy: MemoryStrategy }] });

      expect(manager.inspect().consumers).toHaveLength(1);
    });

    it('should not mount a name that is already mounted', async () => {
      await plugin.use(app, { strategies: [{ strategy: MemoryStrategy }] });

      const manager = container.get(QueueManager);
      const first = manager.getStrategy();

      await container.resolve(QueuePlugin).use(app, { strategies: [{ strategy: MemoryStrategy }] });

      expect(manager.getStrategy()).toBe(first);
    });
  });

  it('should keep the defaults when no options are given', async () => {
    await plugin.use(app);

    expect(container.get(QueueManager).defaults).toMatchObject({ autoStart: true, concurrency: 1 });
  });

  describe('health', () => {
    class PingStrategy extends RecordingStrategy {
      public static reachable = true;

      public async ping(): Promise<void> {
        if (!PingStrategy.reachable) {
          throw new Error('ECONNREFUSED 127.0.0.1:6379');
        }
      }
    }

    beforeEach(() => {
      PingStrategy.reachable = true;
      app.health.configure({ cacheTtl: 0 });
    });

    it('should register a check for every mount that talks to a broker', async () => {
      await plugin.use(app, {
        strategies: [{ strategy: MemoryStrategy }, { name: 'jobs', strategy: PingStrategy }],
      });

      expect(app.health.names).toEqual(['queue:jobs']);
      expect((await app.health.check()).checks['queue:jobs']).toMatchObject({ status: 'ok', critical: true });
    });

    it('should report down when the broker is unreachable', async () => {
      await plugin.use(app, { strategies: [{ name: 'jobs', strategy: PingStrategy }] });

      PingStrategy.reachable = false;

      const report = await app.health.check();

      expect(report.status).toBe('down');
      expect(report.checks['queue:jobs']).toMatchObject({ status: 'down', error: 'ECONNREFUSED 127.0.0.1:6379' });
    });

    it('should report down once the mount is gone', async () => {
      await plugin.use(app, { strategies: [{ name: 'jobs', strategy: PingStrategy }] });
      await container.get(QueueManager).unmount('jobs');

      expect((await app.health.check()).checks['queue:jobs'].error).toContain('No queue strategy is mounted under "jobs"');
    });

    it('should register nothing with health: false', async () => {
      await plugin.use(app, { health: false, strategies: [{ name: 'jobs', strategy: PingStrategy }] });

      expect(app.health.size).toBe(0);
    });

    it('should mark the checks non-critical and pass the timeout on', async () => {
      await plugin.use(app, { health: { critical: false, timeout: 20 }, strategies: [{ name: 'jobs', strategy: PingStrategy }] });

      PingStrategy.reachable = false;

      const report = await app.health.check();

      expect(report.status).toBe('degraded');
      expect(report.checks['queue:jobs'].critical).toBe(false);
    });

    it('should not hand the health option to the manager', async () => {
      await plugin.use(app, { health: false, concurrency: 3 });

      expect(container.get(QueueManager).defaults).not.toHaveProperty('health');
    });
  });
});
