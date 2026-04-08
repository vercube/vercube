import { defu } from 'defu';
import { BasePlugin } from '../Services/Plugins/BasePlugin';
import type { DeepPartial, MaybePromise } from '../Types/CommonTypes';
import type { ConfigTypes } from '../Types/ConfigTypes';
import type {
  InferPluginOptions,
  VercubePlugin,
  VercubePluginCliContext,
  VercubePluginEnv,
  VercubePluginHooksContext,
  VercubePluginInput,
} from '../Types/Plugin';

export type { VercubePlugin, VercubePluginEnv } from '../Types/Plugin';

type HookCleanup = () => void;

/**
 * Tracks cleanup callbacks for plugin-registered dev hooks per hookable instance.
 * This prevents listener accumulation across config reloads in `vercube dev`.
 */
const pluginDevHookCleanupMap: WeakMap<object, HookCleanup[]> = new WeakMap();

/**
 * Returns the same plugin object; narrows the type for object literals.
 *
 * @param plugin - Plugin definition with optional hooks.
 * @returns The input plugin unchanged.
 */
export function defineVercubePlugin(plugin: VercubePlugin): VercubePlugin {
  return plugin;
}

/**
 * Builds a `[PluginClass, options]` tuple with options typed from the class `BasePlugin` generic.
 *
 * @param PluginClass - Constructor extending `BasePlugin<TOptions>`.
 * @param options - Options object matching `TOptions` for that class.
 * @returns Tuple consumed by the config `plugins` pipeline.
 */
export function withPluginOptions<TClass extends new (...args: any[]) => BasePlugin<any>>(
  PluginClass: TClass,
  options: NoInfer<InferPluginOptions<TClass>>,
): [TClass, InferPluginOptions<TClass>] {
  return [PluginClass, options];
}

/**
 * @param value - Any value to test.
 * @returns True if `value` is a constructor whose prototype extends `BasePlugin`.
 */
export function isBasePluginClass(value: unknown): value is new (...args: unknown[]) => BasePlugin {
  return typeof value === 'function' && value.prototype instanceof BasePlugin;
}

/**
 * Adapts a `BasePlugin` subclass into a `VercubePlugin` for `defineConfig({ plugins })`.
 *
 * @param PluginClass - Plugin class constructor.
 * @param options - Optional value passed into `configure`, `setup` / `use`, and `hooks`.
 * @param displayName - Optional name; defaults to `PluginClass.name`.
 * @returns Object implementing `VercubePlugin` that delegates to the class.
 */
export function vercubePluginFromClass<T>(
  PluginClass: (new (...args: unknown[]) => BasePlugin<T>) & typeof BasePlugin<T>,
  options?: T,
  displayName?: string,
): VercubePlugin {
  const name = displayName ?? PluginClass.name;
  return {
    name,
    config: async (cfg, _env) => {
      const sample = new PluginClass();
      const configure = sample.configure;
      if (typeof configure === 'function') {
        return configure.call(sample, cfg, options);
      }
      return undefined;
    },
    setup: async (app) => {
      const instance = app.container.resolve(PluginClass);
      if (typeof instance.setup === 'function') {
        return instance.setup.call(instance, app, options);
      }
      return instance.use(app, options);
    },
    cli: async (ctx) => {
      const sample = new PluginClass();
      if (typeof sample.setupCLI === 'function') {
        return sample.setupCLI.call(sample, ctx);
      }
    },
    hooks: async (ctx) => {
      const sample = new PluginClass();
      if (typeof sample.hooks === 'function') {
        return sample.hooks.call(sample, ctx, options);
      }
    },
  };
}

/**
 * Resolves async plugin factories and normalizes class entries into `VercubePlugin` objects.
 *
 * @param inputs - Raw `plugins` array from config, or undefined.
 * @returns Resolved plugins in source order (before `enforce` sorting elsewhere).
 * @throws {Error} If an array entry is neither `[Class]`, `[Class, options]`, nor a valid plugin shape.
 */
export async function normalizeVercubePluginInputs(inputs: readonly VercubePluginInput[] | undefined): Promise<VercubePlugin[]> {
  if (!inputs?.length) {
    return [];
  }
  const out: VercubePlugin[] = [];
  for (const entry of inputs) {
    if (Array.isArray(entry)) {
      if (entry.length > 0 && isBasePluginClass(entry[0])) {
        out.push(vercubePluginFromClass(entry[0], entry[1]));
        continue;
      }
      if (entry.length === 1) {
        out.push(...(await normalizeVercubePluginInputs([entry[0] as VercubePluginInput])));
        continue;
      }
      throw new Error('Invalid plugin entry: use a BasePlugin class, [Class, options?], a factory function, or a plugin object');
    }
    if (isBasePluginClass(entry)) {
      out.push(vercubePluginFromClass(entry));
      continue;
    }
    const resolved =
      typeof entry === 'function' && !isBasePluginClass(entry)
        ? await (entry as () => MaybePromise<VercubePlugin>)()
        : await Promise.resolve(entry as MaybePromise<VercubePlugin>);
    out.push(resolved);
  }
  return out;
}

/**
 * @param plugins - Resolved plugins in user list order.
 * @returns Same plugins reordered: `enforce: 'pre'`, then unspecified, then `enforce: 'post'`.
 */
function sortByEnforce(plugins: VercubePlugin[]): VercubePlugin[] {
  const pre: VercubePlugin[] = [];
  const mid: VercubePlugin[] = [];
  const post: VercubePlugin[] = [];
  for (const p of plugins) {
    if (p.enforce === 'pre') {
      pre.push(p);
    } else if (p.enforce === 'post') {
      post.push(p);
    } else {
      mid.push(p);
    }
  }
  return [...pre, ...mid, ...post];
}

/**
 * Runs each plugin's `config` hook (merge order), normalizes `plugins` to resolved objects, runs `cli` hooks, and merges registered commands into `config.cli.commands`.
 *
 * @param config - Full Vercube config (may contain raw plugin inputs).
 * @param env - Working directory and CLI context flags.
 * @returns Config with `plugins` normalized and CLI commands aggregated.
 */
export async function applyVercubePluginHooks(config: ConfigTypes.Config, env: VercubePluginEnv): Promise<ConfigTypes.Config> {
  const rawPlugins = config.plugins;
  if (!rawPlugins?.length) {
    return config;
  }

  const resolvedPlugins = await normalizeVercubePluginInputs(rawPlugins);
  const ordered = sortByEnforce(resolvedPlugins);

  let next: ConfigTypes.Config = { ...config, plugins: ordered };

  for (const plugin of ordered) {
    const patch = await plugin.config?.(next, env);
    if (patch && typeof patch === 'object') {
      const { plugins: _ignored, ...rest } = patch as ConfigTypes.Config;
      const merged = defu(next, rest as DeepPartial<ConfigTypes.Config>) as ConfigTypes.Config;
      merged.plugins = ordered;
      next = merged;
    }
  }

  const commands = [...(next.cli?.commands ?? [])];
  const register = (...cmds: (new () => unknown)[]) => {
    commands.push(...cmds);
  };

  const cliCtx: VercubePluginCliContext = {
    cwd: env.cwd,
    command: env.command,
    config: next,
    register,
  };

  for (const plugin of ordered) {
    await plugin.cli?.(cliCtx);
  }

  next = {
    ...next,
    cli: {
      ...next.cli,
      commands,
    },
  };

  return next;
}

/**
 * Invokes `hooks` on each resolved plugin (dev parent process only).
 *
 * @param plugins - Normalized plugins from config (after `applyVercubePluginHooks`).
 * @param ctx - Hooks context from devkit (`config`, `hooks`).
 * @returns Resolves when every plugin `hooks` call completes.
 */
export async function invokeVercubePluginDevHooks(
  plugins: VercubePlugin[] | undefined,
  ctx: VercubePluginHooksContext,
): Promise<void> {
  if (!plugins?.length) {
    return;
  }

  const rawHooks = ctx.hooks as Record<string, any> | undefined;
  if (!rawHooks || typeof rawHooks !== 'object') {
    for (const plugin of plugins) {
      await plugin.hooks?.(ctx);
    }
    return;
  }

  // Remove hooks registered by plugins during the previous config load cycle.
  const previousCleanup = pluginDevHookCleanupMap.get(rawHooks);
  if (previousCleanup?.length) {
    for (const dispose of previousCleanup) {
      dispose();
    }
  }

  const cleanup: HookCleanup[] = [];

  const trackedHooks = new Proxy(rawHooks, {
    get(target, prop, receiver) {
      if (prop === 'hook') {
        return (name: string, handler: (...args: any[]) => any, ...rest: any[]) => {
          const result = Reflect.apply(target.hook, target, [name, handler, ...rest]);

          if (typeof result === 'function') {
            cleanup.push(result as HookCleanup);
          } else if (typeof target.removeHook === 'function') {
            cleanup.push(() => {
              target.removeHook(name, handler);
            });
          }

          return result;
        };
      }

      if (prop === 'addHooks') {
        return (hooksObject: Record<string, (...args: any[]) => any>) => {
          const result = Reflect.apply(target.addHooks, target, [hooksObject]);
          if (typeof target.removeHooks === 'function') {
            cleanup.push(() => {
              target.removeHooks(hooksObject);
            });
          }
          return result;
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });

  const nextCtx: VercubePluginHooksContext = {
    ...ctx,
    hooks: trackedHooks,
  };

  for (const plugin of plugins) {
    await plugin.hooks?.(nextCtx);
  }

  pluginDevHookCleanupMap.set(rawHooks, cleanup);
}
