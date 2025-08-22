import { loadVercubeConfig } from '@vercube/core';
import { createHooks } from 'hookable';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { ConfigTypes, DeepPartial } from '@vercube/core';

/**
 * Creates a development server application.
 * @param {DeepPartial<ConfigTypes.Config>} cfg - The configuration for the application.
 * @returns {DevKitTypes.App} The development server application instance.
 */
export async function createVercube(cfg?: DeepPartial<ConfigTypes.Config>): Promise<DevKitTypes.App> {
  const hooks = createHooks<DevKitTypes.Hooks>();
  const config = await loadVercubeConfig({ ...cfg, dev: true });

  return {
    hooks,
    config,
  };
}
