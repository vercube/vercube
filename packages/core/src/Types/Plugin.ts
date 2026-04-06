/**
 * @module Types/Plugin
 * Public type definitions for the config-time plugin pipeline (`defineConfig({ plugins })`, CLI, dev parent).
 */
import type { App } from '../Common/App';
import type { BasePlugin } from '../Services/Plugins/BasePlugin';
import type { DeepPartial, MaybePromise } from './CommonTypes';
import type { ConfigTypes } from './ConfigTypes';

/**
 * Context passed to `BasePlugin.setupCLI` and object-style plugins' `cli` hook when the CLI loads config.
 */
export interface VercubePluginCliContext {
  /** Current working directory used to resolve the config file. */
  cwd: string;
  /**
   * Citty subcommand when known (for example `dev`, `build`).
   */
  command?: string;
  /** Merged configuration after the `config` plugin phase. */
  config: ConfigTypes.Config;
  /** Appends decorated command class constructors to the merged `config.cli.commands` list. */
  register: (...commands: (new () => unknown)[]) => void;
}

/**
 * Context passed to `BasePlugin.hooks` and object-style plugins' `hooks` hook in the `vercube dev` parent process only.
 *
 * `hooks` is typed as `unknown` so devkit's `Hookable<DevKitTypes.Hooks>` assigns without pulling `@vercube/devkit` into core.
 */
export interface VercubePluginHooksContext {
  /** Merged configuration for the dev session. */
  config: ConfigTypes.Config;
  /** Devkit hookable instance (`bundler-watch:*`, `dev:reload`, and related events). */
  hooks: unknown;
}

/**
 * Environment passed to plugin `config` and `setup` hooks during config loading and app bootstrap.
 */
export interface VercubePluginEnv {
  /** Working directory for config resolution and path-relative behavior. */
  cwd: string;
  /** Active CLI subcommand when hooks run in a CLI context. */
  command?: string;
  /** True when configuration is loaded for a development session. */
  dev?: boolean;
  /** True when configuration is loaded for production. */
  production?: boolean;
}

/**
 * Object-style plugin with optional lifecycle hooks (config merge, runtime setup, CLI registration, dev hooks).
 */
export interface VercubePlugin {
  /** Display name for logging and debugging. */
  name?: string;
  /**
   * When the `config` hook runs relative to other plugins.
   * `pre` runs first, `post` runs last; default runs in user order between them.
   */
  enforce?: 'pre' | 'post';
  /**
   * Merge partial configuration into the resolved config; returned values override previous layers.
   */
  config?: (config: ConfigTypes.Config, env: VercubePluginEnv) => MaybePromise<void | DeepPartial<ConfigTypes.Config>>;
  /** Worker process: DI bindings, services, controllers. */
  setup?: (app: App, env: VercubePluginEnv) => MaybePromise<void>;
  /** Register CLI command classes (citty / `@vercube/cli`). */
  cli?: (ctx: VercubePluginCliContext) => MaybePromise<void>;
  /**
   * Parent process only when running `vercube dev`: subscribe to `ctx.hooks` for bundler and reload events.
   */
  hooks?: (ctx: VercubePluginHooksContext) => MaybePromise<void>;
}

/**
 * Resolves `TOptions` from a class that extends `BasePlugin<TOptions>`.
 *
 * @typeParam TClass - Constructor type whose instance extends `BasePlugin`.
 */
export type InferPluginOptions<TClass extends new (...args: any[]) => BasePlugin<any>> = TClass extends new (
  ...args: any[]
) => BasePlugin<infer O>
  ? O
  : never;

/**
 * Class-only plugin entry as a tuple, checked with `satisfies` against `BasePlugin` options (no runtime helper).
 *
 * @typeParam TClass - `BasePlugin` subclass constructor.
 */
export type PluginWithOptions<TClass extends new (...args: any[]) => BasePlugin<any>> =
  | readonly [TClass]
  | readonly [TClass, InferPluginOptions<TClass>];

/**
 * Raw values allowed in `defineConfig({ plugins: [...] })` before `normalizeVercubePluginInputs`.
 *
 * Includes resolved plugin objects, promises, factories, bare `BasePlugin` classes, and `[Class, options?]` tuples.
 */
export type VercubePluginInput =
  | VercubePlugin
  | MaybePromise<VercubePlugin>
  | (() => MaybePromise<VercubePlugin>)
  | (new (...args: unknown[]) => BasePlugin)
  | [new (...args: unknown[]) => BasePlugin, unknown?];

/**
 * Convenience aliases for config-time plugin typing (`defineConfig`, tooling).
 */
export namespace PluginTypes {
  /**
   * Any `BasePlugin` subclass constructor.
   */
  export type PluginClass = new (...args: any[]) => BasePlugin;

  /**
   * Class entry as a bare constructor or `[Class, options]` before normalization.
   */
  export type PluginDef = PluginClass | [PluginClass, unknown];

  /**
   * Same union as `VercubePluginInput`: all shapes allowed in `plugins` before resolution.
   */
  export type PluginEntry = VercubePluginInput;

  /** Alias for `VercubePluginCliContext`. */
  export type CliContext = VercubePluginCliContext;
}
