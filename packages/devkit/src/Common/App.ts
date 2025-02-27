import { createHooks } from 'hookable';
import type { DevKitTypes } from '../Support/DevKitTypes';

/**
 * Creates a development server application.
 * @returns {DevKitTypes.App} The development server application instance.
 */
export function createVercube(): DevKitTypes.App {
  const hooks = createHooks<DevKitTypes.Hooks>();

  return {
    hooks,
  };
}