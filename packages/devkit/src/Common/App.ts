import { createHooks } from 'hookable';
import type { DevKitTypes } from '../Support/DevKitTypes';
import { loadVercubeConfig } from '@vercube/core';

/**
 * Creates a development server application.
 * @returns {DevKitTypes.App} The development server application instance.
 */
export async function createVercube(): Promise<DevKitTypes.App> {
  const hooks = createHooks<DevKitTypes.Hooks>();
  const config = await loadVercubeConfig({ dev: true });

  return {
    hooks,
    config,
  };
}