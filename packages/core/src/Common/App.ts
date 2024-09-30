import { Container, initializeContainer, Inject } from '@cube/di';
import { createApp, toNodeListener, type App as H3App } from 'h3';
import { listen } from 'listhen';
import { RouterRegistry } from '../Services/Router/RouterRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import type { Plugin } from '../Services/Plugins/Plugin';

/**
 * Represents the main application class.
 */
export class App {

  @Inject(RouterRegistry)
  private gRouterRegistry!: RouterRegistry;

  @Inject(PluginsRegistry)
  private gPluginsRegistry!: PluginsRegistry;

  /** Holds H3 app instance */
  private fH3App!: H3App;

  /** Holds the initialization status of the application */
  private fIsInitialized: boolean = false;

  /** Holds the dependency injection container */
  private fInternalContainer!: Container;

  /**
   * Gets the dependency injection container.
   *
   * @returns {Container} The dependency injection container.
   */
  public get container(): Container {
    return this.fInternalContainer;
  }

  /**
   * Sets the dependency injection container.
   *
   * @param {Container} container - The dependency injection container.
   */
  public set container(container: Container) {
    this.fInternalContainer = container
  }

  /**
   * Initializes the application.
   *
   * @returns {Promise<void>} A promise that resolves when the application is initialized.
   */
  public async init(): Promise<void> {
    this.fH3App = createApp();
  }

  /**
   * Registers a plugin.
   *
   * @param {typeof Plugin} plugin - The plugin to register.
   * @param {unknown} options - The options to pass to the plugin.
   */
  public registerPlugin<T>(plugin: typeof Plugin<T>, options?: T): void {
    this.gPluginsRegistry.register(plugin, options);
  }

  /**
   * Starts the application and begins listening for incoming requests.
   *
   * @param {Object} [opts] - Optional parameters.
   * @param {number} [opts.port] - The port to listen on.
   * @returns {Promise<void>} A promise that resolves when the application starts listening.
   * @throws {Error} If the application is already initialized.
   */
  public async listen(opts?: { port?: number }): Promise<void> {
    if (this.fIsInitialized) {
      throw new Error('App is already initialized');
    }

    // resolve routes
    this.resolveRoutes();

    // resolve plugins
    await this.resolvePlugins();

    // initialize container with all decorators
    initializeContainer(this.container);

    // start listening
    await listen(toNodeListener(this.fH3App), { port: opts?.port ?? 3000 });
  }

  /**
   * Resolves and initializes the routes for the application.
   *
   * @private
   */
  private resolveRoutes(): void {
    this.gRouterRegistry.init();
    this.fH3App.use(this.gRouterRegistry.router);
  }

  /**
   * Resolves and initializes the plugins for the application.
   *
   * @private
   */
  private async resolvePlugins(): Promise<void> {
    await this.gPluginsRegistry.init(this);
  }

}