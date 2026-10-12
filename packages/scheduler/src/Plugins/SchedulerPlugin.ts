import { BasePlugin, initializeMetadata, skipGlobalMiddlewares } from '@vercube/core';
import { DEFAULT_HTTP_PATH, SchedulerController } from '../Controllers/SchedulerController';
import { SchedulerError } from '../Errors/SchedulerError';
import { SchedulerManager } from '../Services/SchedulerManager';
import { $SchedulerHttpOptions } from '../Symbols/SchedulerSymbols';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { App, VercubePluginCliContext } from '@vercube/core';

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
 * // Vercel Cron and other external schedulers call GET /_scheduler/run/<job>
 * app.addPlugin(SchedulerPlugin, {
 *   store: { store: RedisStore, initOptions: { url: process.env.REDIS_URL } },
 *   autoStart: false,
 *   http: { secret: process.env.CRON_SECRET! },
 * });
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

      // close with the application, once however many times the plugin is registered
      app.onClose(() => app.container.get(SchedulerManager).close());
    }

    const manager = app.container.get(SchedulerManager);
    const { store, http, ...settings } = options ?? {};

    manager.configure(settings);

    if (store && !manager.store) {
      await manager.mount(store as SchedulerTypes.Mount<never>);
    }

    if (http) {
      this.mountHttp(app, http);
    }
  }

  /**
   * Adds the `vercube scheduler list` and `vercube scheduler run` commands to
   * the CLI. They are imported only here, so an application never loads the CLI.
   *
   * @param {VercubePluginCliContext} ctx - CLI context to register the commands with
   * @returns {Promise<void>} Resolves once the commands are registered
   * @override
   */
  public override async setupCLI(ctx: VercubePluginCliContext): Promise<void> {
    const { SchedulerCommand } = await import('../Cli');

    ctx.register(SchedulerCommand);
  }

  /**
   * Mounts the HTTP trigger. It never runs without a secret: an open endpoint
   * would let anyone run any job.
   *
   * @param {App} app - The application instance
   * @param {SchedulerTypes.HttpOptions} http - Path and secret of the trigger
   * @returns {void}
   * @throws {SchedulerError} When no secret is set
   */
  private mountHttp(app: App, http: SchedulerTypes.HttpOptions): void {
    if (typeof http.secret !== 'string' || http.secret === '') {
      throw new SchedulerError(
        'The scheduler HTTP trigger needs a secret, such as http: { secret: process.env.CRON_SECRET }',
        'use',
        undefined,
        undefined,
        false,
      );
    }

    if (app.container.getOptional(SchedulerController)) {
      return;
    }

    app.container.bindInstance($SchedulerHttpOptions, { ...http, path: http.path ?? DEFAULT_HTTP_PATH });

    // before the routes are registered, which reads the path once
    initializeMetadata(SchedulerController.prototype).__controller.path = http.path ?? DEFAULT_HTTP_PATH;
    skipGlobalMiddlewares(SchedulerController.prototype);
    app.container.bind(SchedulerController);
  }
}
