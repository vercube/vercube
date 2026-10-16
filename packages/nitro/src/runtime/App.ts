import { createApp, type App, type ConfigTypes } from '@vercube/core';
import { initializeContainer } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { useRuntimeConfig } from 'nitro/runtime-config';
import { NitroStorageManager } from './Storage';
import type { Nitro, NitroOptions } from 'nitro/types';

/**
 * Create a Vercube application from a Nitro instance.
 *
 * The runtime config is read with `useRuntimeConfig()` when the server starts,
 * so `NITRO_*` environment overrides apply, unless one is passed explicitly.
 *
 * @param nitroOpts - Build flags of the Nitro instance.
 * @returns The Vercube application.
 */
export async function createNitroApp(nitroOpts: Partial<Pick<NitroOptions, 'dev' | 'logLevel' | 'runtimeConfig'>>): Promise<App> {
  const app = await createApp({
    cfg: {
      logLevel: getLogLevel(nitroOpts.logLevel),
      production: !nitroOpts.dev,
      dev: nitroOpts.dev,
      runtime: {
        ...(nitroOpts.runtimeConfig ?? useRuntimeConfig()),
      },
    },
  });

  app.container.bind(StorageManager, NitroStorageManager);

  initializeContainer(app.container);

  return app;
}

/**
 * Get the Vercube log level from a Nitro log level.
 * @param logLevel - The Nitro log level.
 * @returns The Vercube log level.
 */
function getLogLevel(logLevel: Nitro['options']['logLevel'] | undefined): ConfigTypes.Config['logLevel'] {
  switch (logLevel) {
    case 0: {
      return 'debug';
    }
    case 1: {
      return 'error';
    }
    case 2: {
      return 'warn';
    }
    case 3: {
      return 'info';
    }
    default:
    case 4: {
      return 'debug';
    }
  }
}
