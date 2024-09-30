import { createHooks } from 'hookable';
import type { DevServerTypes } from './Types';

/**
 * Creates a development server application.
 * @returns {DevServerTypes.App} The development server application instance.
 */
export function createDevServerApp(): DevServerTypes.App {
  const hooks = createHooks<DevServerTypes.Hooks>();

  return {
    hooks,
  };
}