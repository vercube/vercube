import { createApp, vercubePluginFromClass } from '@vercube/core';
import { DevtoolsPlugin } from '../../src/Plugins/DevtoolsPlugin';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';
import type { App } from '@vercube/core';

/**
 * Boots an application with devtools enabled.
 *
 * Devtools is registered through the config rather than `addPlugin`, because
 * only the config phase runs early enough for its metric reader and bootstrap
 * observer to be in place.
 *
 * @param options - Devtools options; `enabled` defaults to true
 * @param setup - Extra container wiring before the app initialises
 * @returns The running application
 */
export async function createDevtoolsApp(
  options: DevtoolsTypes.Options = {},
  setup?: (app: App) => void | Promise<void>,
): Promise<App> {
  return createApp({
    cfg: {
      requestLogging: false,
      plugins: [vercubePluginFromClass(DevtoolsPlugin, { enabled: true, ...options })],
    },
    setup: async (app) => {
      await setup?.(app);
    },
  });
}

/**
 * Performs a devtools API call against a booted application.
 *
 * @param app - Running application
 * @param path - Endpoint path relative to the devtools mount point
 * @param init - Extra request options
 * @returns The raw response
 */
export function devtoolsFetch(app: App, path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

/**
 * Performs a devtools API call and parses the JSON payload.
 *
 * @param app - Running application
 * @param path - Endpoint path relative to the devtools mount point
 * @returns The parsed payload
 */
export async function devtoolsJson<T>(app: App, path: string): Promise<T> {
  const response = await devtoolsFetch(app, path);
  return (await response.json()) as T;
}
