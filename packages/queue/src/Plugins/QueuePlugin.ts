import { BasePlugin } from '@vercube/core';
import { QueueManager } from '../Services/QueueManager';
import type { QueueTypes } from '../Types/QueueTypes';
import type { App } from '@vercube/core';

/**
 * Queue Plugin for Vercube framework
 *
 * Binds the {@link QueueManager}, mounts the strategies it is given and lets the
 * `@Consumer()` classes bound in the container start consuming once the
 * application is up. Consumer classes themselves stay in your hands: bind them
 * where you bind your controllers.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@vercube/core';
 * import { QueuePlugin } from '@vercube/queue';
 * import { BullMQStrategy } from '@vercube/queue/strategies/BullMQStrategy';
 *
 * export default defineConfig({
 *   plugins: [
 *     [QueuePlugin, {
 *       strategies: [{ strategy: BullMQStrategy, initOptions: { connection: { host: '127.0.0.1', port: 6379 } } }],
 *     }],
 *   ],
 * });
 * ```
 *
 * @example
 * ```ts
 * // a web process that only publishes jobs
 * app.addPlugin(QueuePlugin, {
 *   autoStart: false,
 *   strategies: [{ strategy: MemoryStrategy }],
 * });
 * ```
 *
 * @see {@link https://vercube.dev} for full documentation
 */
export class QueuePlugin extends BasePlugin<QueueTypes.PluginOptions> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'QueuePlugin';

  /**
   * Binds the queue manager and mounts every configured strategy.
   *
   * Registering the plugin more than once, which happens as soon as it is listed
   * both in the config and in `app.addPlugin()`, is harmless: the manager is
   * bound once, settings are merged, and a name that is already mounted is left
   * alone. Rebinding it would drop the settings and the strategies of whoever
   * registered first.
   *
   * @param {App} app - The application instance
   * @param {QueueTypes.PluginOptions} [options] - Strategies to mount and manager-wide settings
   * @returns {Promise<void>} Resolves once every strategy is mounted
   * @override
   */
  public override async use(app: App, options?: QueueTypes.PluginOptions): Promise<void> {
    if (!app.container.getOptional(QueueManager)) {
      app.container.bind(QueueManager);
    }

    const manager = app.container.get(QueueManager);
    const { strategies, ...defaults } = options ?? {};

    manager.configure(defaults);

    for (const mount of strategies ?? []) {
      if (manager.getStrategy(mount.name)) {
        continue;
      }

      await manager.mount(mount as QueueTypes.Mount<never>);
    }
  }
}
