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
 * @param cfg - Configuration from the plugin options, such as `health`.
 * @returns The Vercube application.
 */
export async function createNitroApp(
  nitroOpts: Partial<Pick<NitroOptions, 'dev' | 'logLevel' | 'runtimeConfig'>>,
  cfg: Pick<ConfigTypes.Config, 'health'> = {},
): Promise<App> {
  const runtime = nitroOpts.runtimeConfig ?? useRuntimeConfig();

  const app = await createApp({
    cfg: {
      logLevel: getLogLevel(nitroOpts.logLevel),
      production: !nitroOpts.dev,
      dev: nitroOpts.dev,
      runtime: {
        ...runtime,
      },
      // the plugin's option wins over `vercube.config.ts`, it is what Nitro routes
      health: withRuntimeToken(cfg.health ?? false, runtime),
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

/**
 * Adds the token from `runtimeConfig.vercube.healthToken` to the `health`
 * option, so it is read when the server starts rather than baked into the build.
 *
 * @param health - The `health` option from the plugin
 * @param runtime - The Nitro runtime config
 * @returns The option with the token, when there is one
 */
function withRuntimeToken(health: ConfigTypes.Config['health'], runtime: Record<string, unknown>): ConfigTypes.Config['health'] {
  const token = (runtime.vercube as { healthToken?: unknown } | undefined)?.healthToken;

  if (!health || typeof token !== 'string' || token === '') {
    return health;
  }

  return { ...(health === true ? {} : health), token };
}
