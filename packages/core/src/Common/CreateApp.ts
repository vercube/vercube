import { initializeContainer } from '@vercube/di';
import { App } from '../Common/App';
import { createContainer } from '../Common/Container';
import { ConfigTypes } from '../Types/ConfigTypes';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { loadVercubeConfig } from '../Config/Loader';

export interface CreateAppOptions {
  cfg?: ConfigTypes.Config;
  setup?: (app: App) => Promise<void>;
}

/**
 * Creates and initializes an instance of the App.
 *
 * @returns {Promise<App>} A promise that resolves to an instance of the App.
 */
export async function createApp({ cfg = {}, setup = undefined }: CreateAppOptions = {}): Promise<App> {
// load config
  const config = await loadVercubeConfig(cfg);

  // create base app container
  const container = createContainer(config);

  // create app instance
  const app = container.resolve(App);

  // set runtime config
  container.get<RuntimeConfig>(RuntimeConfig).runtimeConfig = config?.runtime ?? {};

  // initialize app
  app.container = container;

  // run setup function before initialization of the app
  if (setup) {
    await setup(app);
  }

  await app.init(config);

  // initialize container
  initializeContainer(container);

  return app;
}