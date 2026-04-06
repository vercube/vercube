import { invokeVercubePluginDevHooks, loadVercubeConfig } from '@vercube/core';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { VercubePlugin } from '@vercube/core';

/**
 * Reloads config from disk into `app.config` and invokes each plugin's `hooks()` again with the new config.
 *
 * @param app - Devkit app instance returned by `createVercube` (mutates `app.config`).
 * @returns Resolves when config load and all plugin `hooks` calls finish.
 */
export async function reloadDevkitResolvedConfig(app: DevKitTypes.App): Promise<void> {
  const cwd = app.config.build?.root ?? process.cwd();
  const next = await loadVercubeConfig({ dev: true }, { cwd });
  app.config = next;
  await invokeVercubePluginDevHooks(next.plugins as VercubePlugin[] | undefined, {
    hooks: app.hooks,
    config: next,
  });
}
