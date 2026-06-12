import type { App } from '../../Common/App';
import type { DeepPartial, MaybePromise } from '../../Types/CommonTypes';
import type { ConfigTypes } from '../../Types/ConfigTypes';
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { VercubePluginCliContext, VercubePluginHooksContext } from '../../Types/Plugin';

/**
 * Base class for class-based plugins registered via `defineConfig({ plugins })` or `app.addPlugin()`.
 *
 * @typeParam T - Options type passed into `configure`, `setup` / `use`, and `hooks` when provided.
 */
export class BasePlugin<T = unknown> {
  /** Stable identifier used by the plugin registry and logging. */
  public name!: string;

  /**
   * Legacy runtime attach when the plugin is not registered with a `setup` implementation.
   *
   * @param app - Running application instance.
   * @param options - Optional plugin options from registration or config tuple.
   * @returns Void or a promise that settles when attachment is done.
   */
  public use(app: App, options?: T): void | Promise<void> {}

  /**
   * Merges partial config during the plugin `config` phase (config file and CLI load).
   *
   * @param config - Current merged configuration.
   * @param options - Optional options from `[Class, options]` or adapter.
   * @returns Partial config to merge, or void.
   */
  public configure?(config: ConfigTypes.Config, options?: T): MaybePromise<void | DeepPartial<ConfigTypes.Config>>;

  /**
   * Worker runtime setup when listed in config `plugins`. If defined, runs instead of {@link use}.
   *
   * @param app - Running application instance.
   * @param options - Optional plugin options.
   * @returns Void or a promise that settles when setup is done.
   */
  public setup?(app: App, options?: T): MaybePromise<void>;

  /**
   * Registers CLI commands when config is loaded (citty / `@vercube/cli`).
   *
   * @param ctx - CLI context with `register` and merged `config`.
   * @returns Void or a promise that settles when registration is done.
   */
  public setupCLI?(ctx: VercubePluginCliContext): MaybePromise<void>;

  /**
   * Dev parent process only (`vercube dev`): subscribe to bundler and reload hooks.
   *
   * @param ctx - Merged config and devkit `hooks` instance.
   * @param options - Optional plugin options from the class adapter.
   * @returns Void or a promise that settles when subscriptions are registered.
   */
  public hooks?(ctx: VercubePluginHooksContext, options?: T): MaybePromise<void>;
}
