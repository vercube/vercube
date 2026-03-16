import { destroyContainer } from '@vercube/di';
import { watch } from 'chokidar';
import { useNitroApp } from 'nitro/app';
import { join } from 'pathe';
import { validateBundler } from '../validators/BundlerValidator';
import { validateTypescript } from '../validators/TypescriptValidator';
import { setupRoutes } from './Routes';
import type { PluginOptions } from '../plugin/VercubePlugin';
import type { Nitro } from 'nitro/types';

export function setupHooks(nitro: Nitro, options?: PluginOptions): void {
  /**
   * Validates the bundler and typescript options for the nitro instance
   * @param nitro - The nitro instance
   * @returns void
   */
  nitro.hooks.hook('build:before', async () => {
    validateBundler(nitro);
    validateTypescript(nitro);

    await setupRoutes(nitro);
  });

  nitro.hooks.hook('compiled', async () => {
    await setupRoutes(nitro);
    nitro.routing.sync();
  });

  /**
   * In dev mode, watch controller files for content changes.
   * Nitro's built-in watcher only reacts to add/unlink events (not `change`),
   * and Rollup only watches files it directly imports. Controller files
   * decorated with @Controller are not imported by Rollup, so their changes
   * are invisible to Nitro. This watcher bridges that gap.
   */
  if (nitro.options.dev) {
    const scanDirs = nitro.options.scanDirs.flatMap((dir) => [
      join(dir, nitro.options.apiDir || 'api'),
      join(dir, nitro.options.routesDir || 'routes'),
      ...(options?.scanDirs ?? []),
    ]);

    const watcher = watch(scanDirs, { ignoreInitial: true }).on('change', async () => {
      await nitro.hooks.callHook('compiled', nitro);
    });

    nitro.hooks.hook('close', () => watcher.close());
  }

  /**
   * Destroys the Vercube container
   * @param nitro - The nitro instance
   * @returns void
   */
  nitro.hooks.hook('close', async () => {
    if (!useNitroApp().__vercubeContainer__) {
      return;
    }

    destroyContainer(useNitroApp().__vercubeContainer__!);
  });
}
