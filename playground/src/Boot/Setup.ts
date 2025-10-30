import { type App } from '@vercube/core';
import { MCPPlugin } from '@vercube/mcp';
import { SchemaPlugin } from '@vercube/schema';
import { WebsocketPlugin } from '@vercube/ws';

/**
 * Setup the application.
 * @param {App} app - The application instance.
 */
export async function setup(app: App): Promise<void> {
  // register plugins
  app.addPlugin(SchemaPlugin);
  app.addPlugin(WebsocketPlugin);
  app.addPlugin(MCPPlugin);
}
