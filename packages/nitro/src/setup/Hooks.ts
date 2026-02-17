import { destroyContainer } from '@vercube/di';
import { useNitroApp } from 'nitro/app';
import { validateBundler } from '../validators/BundlerValidator';
import { validateTypescript } from '../validators/TypescriptValidator';
import { setupRoutes } from './Routes';
import type { Nitro } from 'nitro/types';

export function setupHooks(nitro: Nitro): void {
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

  nitro.hooks.hook('rollup:reload', async () => {
    await setupRoutes(nitro);
    nitro.routing.sync();
  });

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
