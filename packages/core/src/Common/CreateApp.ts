import { initializeContainer } from '@cube/di';
import { App } from '../Common/App';
import { createContainer } from '../Common/Container';
/**
 * Creates and initializes an instance of the App.
 *
 * @returns {Promise<App>} A promise that resolves to an instance of the App.
 */
export async function createApp(): Promise<App> {
  const container = createContainer();
  const app = container.resolve(App);

  app.container = container;
  await app.init();

  initializeContainer(container);

  return app;
}