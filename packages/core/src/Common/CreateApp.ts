import { initializeContainer } from '@vercube/di';
import { App } from '../Common/App';
import { createContainer } from '../Common/Container';
import { ConfigTypes } from '../Types/ConfigTypes';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { loadVercubeConfig } from '../Config/Loader';

/**
 * Creates and initializes an instance of the App.
 *
 * @returns {Promise<App>} A promise that resolves to an instance of the App.
 */
export async function createApp(cfg?: ConfigTypes.Config): Promise<App> {
  // load config
  const config = await loadVercubeConfig(cfg);

  // create base app container
  const container = createContainer(config);

  // create app instance
  const app = container.resolve(App);

  console.log(config);

  // set runtime config
  container.get<RuntimeConfig>(RuntimeConfig).runtimeConfig = config?.runtime ?? {};

  // initialize app
  app.container = container;
  await app.init(config);

  // initialize container
  initializeContainer(container);

  return app;
}