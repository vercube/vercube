import { createApp } from '@vercube/core';
import { DevtoolsPlugin } from '../../src/Plugins/DevtoolsPlugin';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';
import type { App } from '@vercube/core';

/**
 * Boots an application with devtools enabled.
 * @param options devtools options; `enabled` defaults to true
 * @param setup extra container wiring before the app initialises
 * @returns the running application
 */
export async function createDevtoolsApp(
  options: DevtoolsTypes.Options = {},
  setup?: (app: App) => void | Promise<void>,
): Promise<App> {
  return createApp({
    cfg: { requestLogging: false },
    setup: async (app) => {
      await setup?.(app);
      app.addPlugin(DevtoolsPlugin, { enabled: true, ...options });
    },
  });
}

/**
 * Performs a devtools API call against a booted application.
 * @param app running application
 * @param path endpoint path relative to the devtools mount point
 * @param init extra request options
 * @returns the raw response
 */
export function devtoolsFetch(app: App, path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

/**
 * Performs a devtools API call and parses the JSON payload.
 * @param app running application
 * @param path endpoint path relative to the devtools mount point
 * @returns the parsed payload
 */
export async function devtoolsJson<T>(app: App, path: string): Promise<T> {
  const response = await devtoolsFetch(app, path);
  return (await response.json()) as T;
}
