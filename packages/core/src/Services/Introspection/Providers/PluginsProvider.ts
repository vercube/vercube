import { Inject } from '@vercube/di';
import { GlobalMiddlewareRegistry } from '../../Middleware/GlobalMiddlewareRegistry';
import { PluginsRegistry } from '../../Plugins/PluginsRegistry';
import type { IntrospectionTypes } from '../../../Types/IntrospectionTypes';

/**
 * Describes what has been plugged into the application: registered plugins and
 * the middlewares that run on every route.
 */
export class PluginsProvider implements IntrospectionTypes.Provider<IntrospectionTypes.PluginsDescription> {
  /** @inheritdoc */
  public readonly id = 'plugins';

  /** @inheritdoc */
  public readonly title = 'Plugins';

  @Inject(PluginsRegistry)
  private readonly gPlugins!: PluginsRegistry;

  @Inject(GlobalMiddlewareRegistry)
  private readonly gMiddlewares!: GlobalMiddlewareRegistry;

  /** @inheritdoc */
  public revision(): number {
    return this.gPlugins.plugins.length + this.gMiddlewares.middlewares.length;
  }

  /** @inheritdoc */
  public describe(): IntrospectionTypes.PluginsDescription {
    return {
      plugins: this.gPlugins.plugins.map((plugin) => plugin.name),
      globalMiddlewares: this.gMiddlewares.middlewares.map((definition) => ({
        name: (definition.middleware as { name?: string })?.name ?? 'Middleware',
        priority: definition.priority ?? 999,
      })),
    };
  }
}
