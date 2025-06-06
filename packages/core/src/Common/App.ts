import { type Container, initializeContainer, Inject, InjectOptional } from '@vercube/di';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import type { BasePlugin } from '../Services/Plugins/BasePlugin';
import { ConfigTypes } from '../Types/ConfigTypes';
import { HttpServer } from '../Services/HttpServer/HttpServer';
import { Router } from '../Services/Router/Router';
import { StaticRequestHandler } from '../Services/Router/StaticRequestHandler';
import { Logger } from '@vercube/logger';

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

  @Inject(StaticRequestHandler)
  private gStaticRequestHandler: StaticRequestHandler;

  @InjectOptional(Logger)
  private gLogger: Logger | null;

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

    if (this.fConfig.server?.static) {
      this.gStaticRequestHandler.initialize(this.fConfig.server?.static);
    }
    
    this.gRouter.initialize();
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

    // resolve plugins
    await this.resolvePlugins();

    // initialize container with all decorators
    initializeContainer(this.container);

    // listen for incoming requests
    await this.gHttpServer.listen();

    this.fIsInitialized = true;
  }

  /**
   * Handles an incoming HTTP request.
   * This method is an adapter for HttpServer.handleRequest method.
   * 
   * @param {Request} request - The incoming HTTP request
   * @returns {Promise<Response>} The HTTP response
   */
  public async fetch(request: Request): Promise<Response> {
    return this.gHttpServer.handleRequest(request);
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
