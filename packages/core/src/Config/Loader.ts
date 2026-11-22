import { defu } from 'defu';
import { applyVercubePluginHooks } from '../Plugins/VercubePlugin';
import { defaultConfig } from './DefaultConfig';
import type { ConfigTypes } from '../Types/ConfigTypes';
import type { VercubePluginEnv } from '../Types/Plugin';

export interface LoadVercubeConfigOptions {
  /** Directory containing `vercube.config` (defaults to `process.cwd()`). */
  cwd?: string;
  /** Custom ESM importer (for example CLI `jiti`) when loading the config module. */
  import?: (id: string) => Promise<unknown>;
  /** Active CLI subcommand name, forwarded to `VercubePluginEnv.command` for plugins. */
  command?: string;
  /**
   * `false` skips `vercube.config` and `.env` entirely: the result is the
   * defaults merged with `overrides`. Plugin `config` hooks still run.
   * Tests use it so a suite run from the project root does not pick up the
   * project's own config by accident.
   */
  configFile?: false;
}

/**
 * Where a configuration handed over with {@link provideConfig} is kept.
 * Registered globally, so the copy of core an application bundles and a copy
 * loaded beside it agree on it.
 */
const PROVIDED_CONFIG = Symbol.for('vercube.config.provided');

/**
 * Hands `createApp()` the configuration directly, in place of the
 * `vercube.config` file it would read from disk. For a platform without a file
 * system at run time (Cloudflare Workers, an edge function): import the
 * configuration, so the bundler ships it with the application.
 *
 * `.env` files are not read either. Call it before `createApp()`.
 *
 * @example
 * ```ts
 * import config from '../vercube.config';
 *
 * provideConfig(config);
 *
 * const app = await createApp();
 * ```
 *
 * @param {ConfigTypes.Config | undefined} config - The configuration, or undefined to go back to reading the file
 * @returns {void}
 */
export function provideConfig(config: ConfigTypes.Config | undefined): void {
  (globalThis as Record<symbol, unknown>)[PROVIDED_CONFIG] = config;
}

/**
 * Loads and merges `vercube` config from disk, applies defaults, runs env setup, then the plugin `config` and `cli` pipeline.
 *
 * @param overrides - Values merged on top of file-based config (wins over file).
 * @param options - `cwd`, optional `import`, and `command` for plugin context.
 * @returns Fully merged config with normalized `plugins` and aggregated `cli.commands`.
 */
export async function loadVercubeConfig(
  overrides?: ConfigTypes.Config,
  options?: LoadVercubeConfigOptions,
): Promise<ConfigTypes.Config> {
  const cwd = options?.cwd ?? process.cwd();

  // A configuration that was handed over stands in for the file. An explicit
  // `cwd` still reads from disk: the caller named where the file is.
  const provided =
    options?.configFile === false || options?.cwd !== undefined
      ? undefined
      : ((globalThis as Record<symbol, unknown>)[PROVIDED_CONFIG] as ConfigTypes.Config | undefined);

  if (provided !== undefined) {
    const merged = defu(overrides ?? {}, provided, defaultConfig) as ConfigTypes.Config;

    return applyVercubePluginHooks(merged, {
      cwd,
      dev: merged.dev ?? defaultConfig.dev,
      production: merged.production ?? defaultConfig.production,
      command: options?.command,
    });
  }

  if (options?.configFile === false) {
    return applyVercubePluginHooks(defu(overrides ?? {}, defaultConfig) as ConfigTypes.Config, {
      cwd,
      dev: overrides?.dev ?? defaultConfig.dev,
      production: overrides?.production ?? defaultConfig.production,
      command: options?.command,
    });
  }

  // Loaded here, not at the top: importing c12 costs about 7 ms, and an app
  // that never reads a config file (`configFile: false`, tests) should not pay it.
  const { loadConfig, setupDotenv } = await import('c12');

  const config = await loadConfig<ConfigTypes.Config>({
    name: 'vercube',
    dotenv: overrides?.c12?.dotenv ?? true,
    rcFile: false,
    globalRc: false,
    defaults: defaultConfig,
    cwd,
    ...(options?.import ? { import: options.import } : {}),
  });

  // override dotenv
  if (config?.config?.c12?.dotenv && typeof config?.config?.c12?.dotenv === 'object') {
    await setupDotenv(config.config.c12.dotenv);
  }

  let merged = defu(overrides ?? {}, config?.config ?? {}) as ConfigTypes.Config;

  const env: VercubePluginEnv = {
    cwd,
    dev: merged.dev,
    production: merged.production,
    command: options?.command,
  };

  merged = await applyVercubePluginHooks(merged, env);

  return merged;
}
