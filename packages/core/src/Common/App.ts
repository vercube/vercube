import { type Container, initializeContainer, Inject } from '@vercube/di';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import type { BasePlugin } from '../Services/Plugins/BasePlugin';
import { ConfigTypes } from '../Types/ConfigTypes';
import { HttpServer } from '../Services/HttpServer/HttpServer';
import { Router } from '../Services/Router/Router';

/**
 * Represents the main application class.
 */
export class App {

  @Inject(Router)
  private gRouter: Router;

  @Inject(PluginsRegistry)
  private gPluginsRegistry: PluginsRegistry;

  @Inject(HttpServer)
  private gHttpServer: HttpServer;

  /** Holds the initialization status of the application */
  private fIsInitialized: boolean = false;

  /** Holds the dependency injection container */
  private fInternalContainer!: Container;

  /** Hold app config */
  private fConfig: ConfigTypes.Config;

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
    this.fInternalContainer = container;
  }

  /**
   * Initializes the application.
   *
   * @returns {Promise<void>} A promise that resolves when the application is initialized.
   */
  public async init(cfg: ConfigTypes.Config): Promise<void> {
    this.fConfig = cfg;
    await this.gHttpServer.initialize(this.fConfig);
    this.gRouter.init();
  }

  /**
   * Registers a plugin.
   *
   * @param {typeof Plugin} plugin - The plugin to register.
   * @param {unknown} options - The options to pass to the plugin.
   */
  public registerPlugin<T>(plugin: typeof BasePlugin<T>, options?: T): void {
    this.gPluginsRegistry.register(plugin, options);
  }

  /**
   * Starts the application and begins listening for incoming requests.
   *
   * @returns {Promise<void>} A promise that resolves when the application starts listening.
   * @throws {Error} If the application is already initialized.
   */
  public async listen(): Promise<void> {
    if (this.fIsInitialized) {
      throw new Error('App is already initialized');
    }

    // initialize static server
    this.initializeStaticServer();

    // resolve plugins
    await this.resolvePlugins();

    // initialize container with all decorators
    initializeContainer(this.container);
  }

  /**
   * Resolves and initializes the plugins for the application.
   *
   * @private
   */
  private async resolvePlugins(): Promise<void> {
    await this.gPluginsRegistry.init(this);
  }

  /**
   * Initializes the static server for the application.
   *
   * @private
   */
  private initializeStaticServer(): void {
    // TODO: add static server support
  }

}
