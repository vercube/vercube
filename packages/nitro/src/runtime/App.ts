import { createApp, type App, type ConfigTypes } from '@vercube/core';
import { initializeContainer } from '@vercube/di';
import type { Nitro, NitroOptions } from 'nitro/types';

/**
 * Create a Vercube application from a Nitro instance.
 * @param nitro - The Nitro instance.
 * @returns The Vercube application.
 */
export async function createNitroApp(nitroOpts: NitroOptions): Promise<App> {
  const app = await createApp({
    cfg: {
      logLevel: getLogLevel(nitroOpts.logLevel),
      production: !nitroOpts.dev,
      dev: nitroOpts.dev,
      runtime: {
        ...nitroOpts.runtimeConfig,
      },
    },
  });

  initializeContainer(app.container);

  return app;
}

/**
 * Get the Vercube log level from a Nitro log level.
 * @param logLevel - The Nitro log level.
 * @returns The Vercube log level.
 */
function getLogLevel(logLevel: Nitro['options']['logLevel']): ConfigTypes.Config['logLevel'] {
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
