import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cron } from '../../src/Decorators/Cron';
import { Every } from '../../src/Decorators/Every';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { createLogger } from '../Utils/Harness';
import type { SchedulerTypes } from '../../src/Types/SchedulerTypes';

/** Records every call the job classes make. */
const calls: { job: string; label: string; context: SchedulerTypes.JobContext }[] = [];

class MaintenanceJobs {
  /** Proves the handler keeps its instance bound. */
  private readonly label: string = 'maintenance';

  @Every('5m', { scope: 'instance' })
  public flushCache(context: SchedulerTypes.JobContext): void {
    calls.push({ job: 'flushCache', label: this.label, context });
  }

  @Cron('0 3 * * *', { name: 'billing.close-day', timezone: 'Europe/Warsaw', scope: 'instance' })
  public async closeDay(context: SchedulerTypes.JobContext): Promise<void> {
    calls.push({ job: 'closeDay', label: this.label, context });
  }

  @Every('1h', { name: 'hourly.shifted', offset: '15m', scope: 'instance' })
  public shifted(context: SchedulerTypes.JobContext): void {
    calls.push({ job: 'shifted', label: this.label, context });
  }
}

describe('Scheduler decorators', () => {
  let container: Container;
  let logger: Logger;
  let manager: SchedulerManager;
  let clock: ManualClock;

  beforeEach(() => {
    calls.length = 0;
    clock = new ManualClock('2026-01-01T00:00:00Z');
    container = new Container();
    logger = createLogger();

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bind(SchedulerManager);

    manager = container.get(SchedulerManager);
    manager.configure({ autoStart: false, clock });
  });

  it('registers every decorated method, named after its class unless told otherwise', () => {
    container.bind(MaintenanceJobs);
    initializeContainer(container);

    expect(manager.list()).toEqual([
      expect.objectContaining({
        name: 'MaintenanceJobs.flushCache',
        source: 'MaintenanceJobs.flushCache',
        kind: 'every',
        schedule: 'every 5m',
      }),
      expect.objectContaining({
        name: 'billing.close-day',
        source: 'MaintenanceJobs.closeDay',
        kind: 'cron',
        timezone: 'Europe/Warsaw',
      }),
      expect.objectContaining({ name: 'hourly.shifted', schedule: 'every 1h +15m', nextRun: new Date('2026-01-01T00:15:00Z') }),
    ]);
  });

  it('runs the method on its own instance', async () => {
    container.bind(MaintenanceJobs);
    initializeContainer(container);

    await manager.start();
    await clock.advance('5m');

    expect(calls).toEqual([
      expect.objectContaining({
        job: 'flushCache',
        label: 'maintenance',
        context: expect.objectContaining({ trigger: 'timer' }),
      }),
    ]);
  });

  it('unregisters the jobs when the class is destroyed, so rebinding it does not collide', () => {
    container.bind(MaintenanceJobs);
    initializeContainer(container);

    container.bind(MaintenanceJobs);
    initializeContainer(container);

    expect(manager.list().map((job) => job.name)).toEqual(['MaintenanceJobs.flushCache', 'billing.close-day', 'hourly.shifted']);
  });

  it('fails when the class is bound with an invalid schedule', () => {
    class Broken {
      @Cron('99 * * * *', { name: 'broken' })
      public run(): void {}
    }

    container.bind(Broken);

    expect(() => initializeContainer(container)).toThrow(SchedulerError);
    expect(() => manager.nextRuns('broken')).toThrow(/No job is registered/);
  });

  it('rejects an empty time zone instead of falling back to the default', () => {
    class EmptyZone {
      @Cron('0 3 * * *', { name: 'empty-zone', timezone: '', scope: 'instance' })
      public run(): void {}
    }

    container.bind(EmptyZone);

    expect(() => initializeContainer(container)).toThrow(/Unknown time zone ""/);
  });

  it('warns when the decorated property is not a method', () => {
    class NotAMethod {
      @Every('1m')
      public value: number = 1;
    }

    container.bind(NotAMethod);
    initializeContainer(container);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('@Every() can only decorate methods'));
    expect(manager.list()).toEqual([]);
  });

  it('warns when no scheduler is bound', () => {
    const bare = new Container();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    bare.bindInstance(Container, bare);
    bare.bind(MaintenanceJobs);
    initializeContainer(bare);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SchedulerManager is not bound'));
    warn.mockRestore();
  });

  it('refuses to start a cluster job without an explicit name', async () => {
    class Unnamed {
      @Every('1m')
      public sync(): void {}
    }

    container.bind(Unnamed);
    initializeContainer(container);

    await expect(manager.start()).rejects.toThrow(/Cluster jobs "Unnamed.sync" need an explicit name/);
  });

  it('starts a cluster job with an explicit name', async () => {
    class Named {
      @Every('1m', { name: 'catalog.sync' })
      public sync(): void {}
    }

    await manager.mount({ store: MemoryStore });
    container.bind(Named);
    initializeContainer(container);

    await expect(manager.start()).resolves.toBeUndefined();
    await manager.close();
  });
});
