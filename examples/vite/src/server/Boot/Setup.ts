import { WebsocketPlugin } from '@vercube/ws';
import type { App } from '@vercube/core';

/**
 * App setup hook. Runs before the app initializes — the place to register
 * plugins that auto-discovery cannot infer.
 */
export default async function setup(app: App): Promise<void> {
  app.addPlugin(WebsocketPlugin);
}
