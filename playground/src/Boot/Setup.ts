import { type App } from '@vercube/core';
import { SchemaPlugin } from '@vercube/schema';

/**
 * Setup the application.
 * @param {App} app - The application instance.
 */
export async function setup(app: App): Promise<void> {
  // register plugins
  app.addPlugin(SchemaPlugin);
}