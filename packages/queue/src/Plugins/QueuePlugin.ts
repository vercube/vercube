import { BasePlugin, resolveModuleHealth } from '@vercube/core';
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

      // close with the application, once however many times the plugin is registered
      app.onClose(() => app.container.get(QueueManager).close());
    }

    const manager = app.container.get(QueueManager);
    const { strategies, ...defaults } = options ?? {};

    const { health, ...settings } = defaults;

    manager.configure(settings);

    for (const mount of strategies ?? []) {
      if (manager.getStrategy(mount.name)) {
        continue;
      }

      await manager.mount(mount as QueueTypes.Mount<never>);
      this.registerCheck(app, manager, mount.name ?? 'default', health);
    }
  }

  /**
   * Registers the readiness check of a mount whose strategy talks to a broker.
   * Running it connects the strategy when nothing has yet, which is the first
   * use anyway.
   *
   * @param {App} app - The application instance
   * @param {QueueManager} manager - The queue manager
   * @param {string} name - Mount name
   * @param {QueueTypes.PluginOptions['health']} option - The plugin's `health` option
   * @returns {void}
   */
  private registerCheck(app: App, manager: QueueManager, name: string, option: QueueTypes.PluginOptions['health']): void {
    const settings = resolveModuleHealth(option);

    if (!settings || typeof manager.getStrategy(name)?.ping !== 'function') {
      return;
    }

    app.health.register({ name: `queue:${name}`, ...settings, check: () => manager.ping(name) });
  }
}
