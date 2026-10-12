import { BasePlugin } from '@vercube/core';
import { SchedulerManager } from '../Services/SchedulerManager';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { App } from '@vercube/core';

/**
 * Scheduler Plugin for Vercube framework
 *
 * Binds the {@link SchedulerManager}, mounts the store it is given and arms the
 * timers of every `@Cron()` and `@Every()` job once the application is up. The
 * classes declaring jobs stay in your hands: bind them where you bind your
 * controllers.
 *
 * @example
 * ```ts
 * // any number of replicas: they share their claims through Redis
 * import { defineConfig } from '@vercube/core';
 * import { SchedulerPlugin } from '@vercube/scheduler';
 * import { RedisStore } from '@vercube/scheduler/stores/RedisStore';
 *
 * export default defineConfig({
 *   plugins: [
 *     [SchedulerPlugin, {
 *       store: { store: RedisStore, initOptions: { url: process.env.REDIS_URL } },
 *       defaults: { timezone: 'Europe/Warsaw' },
 *     }],
 *   ],
 * });
 * ```
 *
 * @example
 * ```ts
 * // a single process: MemoryStore only coordinates the managers of one process
 * app.addPlugin(SchedulerPlugin, { store: { store: MemoryStore } });
 * ```
 *
 * @example
 * ```ts
 * // a web-only process: jobs are registered, timers are never armed
 * app.addPlugin(SchedulerPlugin, { autoStart: false });
 * ```
 *
 * @see {@link https://vercube.dev} for full documentation
 */
export class SchedulerPlugin extends BasePlugin<SchedulerTypes.PluginOptions> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'SchedulerPlugin';

  /**
   * Binds the scheduler and mounts the configured store.
   *
   * Registering the plugin more than once is harmless: the scheduler is bound
   * once, settings are merged, and a store that is already mounted is kept.
   *
   * @param {App} app - The application instance
   * @param {SchedulerTypes.PluginOptions} [options] - Store to mount and scheduler-wide settings
   * @returns {Promise<void>} Resolves once the store is mounted
   * @override
   */
  public override async use(app: App, options?: SchedulerTypes.PluginOptions): Promise<void> {
    if (!app.container.getOptional(SchedulerManager)) {
      app.container.bind(SchedulerManager);
    }

    const manager = app.container.get(SchedulerManager);
    const { store, ...settings } = options ?? {};

    manager.configure(settings);

    if (store && !manager.store) {
      await manager.mount(store as SchedulerTypes.Mount<never>);
    }
  }
}
