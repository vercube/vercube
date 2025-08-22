import { Container, Inject } from '@vercube/di';
import { BasePlugin } from './BasePlugin';
import type { App } from '../../Common/App';

export class PluginsRegistry {
  @Inject(Container)
  private gContainer!: Container;

  /** Holds the list of plugins */
  private fPlugins: Map<string, { instance: BasePlugin; options?: unknown }> = new Map();

  /**
   * Registers a plugin.
   *
   * @param {Plugin} plugin - The plugin to register.
   * @param {unknown} options - The options to pass to the plugin.
   */
  public register<T = unknown>(plugin: typeof BasePlugin<T>, options?: T): void {
    const instance = this.gContainer.resolve(plugin);

    if (!instance.name) {
      throw new Error('Plugin must have a name');
    }

    this.fPlugins.set(instance.name, { instance, options });
  }

  /**
   * Gets the list of registered plugins.
   *
   * @returns {Plugin[]} The list of registered plugins.
   */
  public get plugins(): BasePlugin[] {
    return [...this.fPlugins.values()].map((plugin) => plugin.instance);
  }

  /**
   * Resolves the plugins.
   *
   * @param {App} app - The application instance.
   */
  public async init(app: App): Promise<void> {
    for (const { instance, options } of this.fPlugins.values()) {
      await instance.use(app, options);
    }
  }
}
