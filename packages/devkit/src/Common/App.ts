import { invokeVercubePluginDevHooks, loadVercubeConfig } from '@vercube/core';
import { createHooks } from 'hookable';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { ConfigTypes, DeepPartial, VercubePlugin } from '@vercube/core';

/**
 * Loads dev config, builds a `Hookable` app object, and runs plugin `hooks()` in the parent process.
 *
 * @param cfg - Partial config merged before load (typically sets `dev: true` via spread).
 * @returns App handle with `hooks` and resolved `config`.
 */
export async function createVercube(cfg?: DeepPartial<ConfigTypes.Config>): Promise<DevKitTypes.App> {
  const hooks = createHooks<DevKitTypes.Hooks>();
  const cwd = cfg?.build?.root ?? process.cwd();
  const config = await loadVercubeConfig({ ...cfg, dev: true }, { cwd });

  const app: DevKitTypes.App = {
    hooks,
    config,
  };

  await invokeVercubePluginDevHooks(config.plugins as VercubePlugin[] | undefined, {
    hooks,
    config,
  });

  return app;
}
