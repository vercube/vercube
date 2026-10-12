import { initializeContainer } from '@vercube/di';
import { App } from '../Common/App';
import { createContainer } from '../Common/Container';
import { loadVercubeConfig } from '../Config/Loader';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import type { MaybePromise } from '../Types/CommonTypes';
import type { ConfigTypes } from '../Types/ConfigTypes';

export interface CreateAppOptions {
  /** Configuration merged over the loaded `vercube.config` (or the defaults). */
  cfg?: ConfigTypes.Config;

  /** Runs before plugins are applied, to bind controllers, services and plugins. */
  setup?: (app: App) => MaybePromise<void>;

  /**
   * Runs after plugins have been applied and before the container is
   * initialised. This is the last point where a binding can still be replaced
   * and reach every service: a plugin may bind keys while it is applied, and a
   * binding replaced after this point no longer reaches instances that exist.
   */
  beforeInitialize?: (app: App) => MaybePromise<void>;

  /**
   * Where the configuration comes from. `false` reads neither `vercube.config`
   * nor `.env` and uses the defaults merged with `cfg`. An object loads them
   * from `cwd`. Defaults to loading them from `process.cwd()`.
   */
  configFile?: false | { cwd?: string };
}

/**
 * Creates and initializes an instance of the App.
 *
 * @returns {Promise<App>} A promise that resolves to an instance of the App.
 */
export async function createApp({
  cfg = {},
  setup = undefined,
  beforeInitialize = undefined,
  configFile = undefined,
}: CreateAppOptions = {}): Promise<App> {
  // load config
  const config = await loadVercubeConfig(cfg, configFile === false ? { configFile: false } : { cwd: configFile?.cwd });

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

  // last chance to replace bindings, plugins have bound theirs by now
  if (beforeInitialize) {
    await beforeInitialize(app);
  }

  // initialize container
  initializeContainer(container);

  return app;
}
