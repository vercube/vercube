import { SchedulerPlugin } from '../Plugins/SchedulerPlugin';
import { SchedulerManager } from '../Services/SchedulerManager';
import { MemoryStore } from '../Stores/MemoryStore';
import { ManualClock } from './ManualClock';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { TestingTypes } from '@vercube/testing';

/**
 * The extension {@link withManualClock} returns.
 */
export interface ManualClockExtension extends TestingTypes.Extension {
  /** The clock the scheduler runs on. Time only moves when the test moves it. */
  readonly clock: ManualClock;

  /** The scheduler of the app under test, once it has booted. */
  readonly scheduler: SchedulerManager;
}

/**
 * Runs the scheduler on a {@link ManualClock} for `createTestApp()` from
 * `@vercube/testing`.
 *
 * Cluster jobs, the default scope, get a `MemoryStore` unless `options.store`
 * mounts another one.
 *
 * @param start - Where the clock starts, defaults to now
 * @param options - Scheduler plugin options, such as a `store`
 * @returns The extension
 *
 * @example
 * ```ts
 * const time = withManualClock('2026-01-01T00:00:00Z');
 * const app = await createTestApp({ providers: [Reports], extensions: [time] });
 *
 * await time.clock.advance('1h');
 * expect(app.resolve(Reports).generated).toBe(1);
 *
 * await time.scheduler.trigger('reports.daily');
 * ```
 */
export function withManualClock(
  start?: Date | number | string,
  options: Omit<SchedulerTypes.PluginOptions, 'clock'> = {},
): ManualClockExtension {
  const clock = new ManualClock(start);
  let scheduler: SchedulerManager | null = null;

  return {
    name: 'withManualClock',
    clock,
    get scheduler() {
      if (!scheduler) {
        throw new Error('withManualClock() is not set up yet: pass it to createTestApp({ extensions }) first.');
      }

      return scheduler;
    },
    setup: (app) => {
      app.addPlugin(SchedulerPlugin, { store: { store: MemoryStore }, ...options, clock });
    },
    ready: (testApp) => {
      scheduler = testApp.resolve(SchedulerManager);
    },
  };
}
