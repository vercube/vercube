import { loadConfig, setupDotenv } from 'c12';
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
