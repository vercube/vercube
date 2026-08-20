import { type App } from '@vercube/core';
import { QueuePlugin } from '@vercube/queue';
import { MemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy';
import { SchemaPlugin } from '@vercube/schema';
import { WebsocketPlugin } from '@vercube/ws';

/**
 * Setup the application.
 * @param {App} app - The application instance.
 */
export async function setup(app: App): Promise<void> {
  // register plugins
  app.addPlugin(SchemaPlugin);
  app.addPlugin(QueuePlugin, { strategies: [{ strategy: MemoryStrategy }] });
  app.addPlugin(WebsocketPlugin);
}
