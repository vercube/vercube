import { type App } from '@vercube/core';
import { WebsocketPlugin } from '@vercube/ws';

/**
 * Setup the application.
 * @param {App} app - The application instance.
 */
export async function setup(app: App): Promise<void> {
  app.addPlugin(WebsocketPlugin);
}
