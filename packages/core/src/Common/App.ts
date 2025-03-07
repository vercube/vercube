import { type Container, initializeContainer, Inject } from '@vercube/di';
import { createApp, toNodeListener, type App as H3App, serveStatic, eventHandler } from 'h3';
import { listen } from 'listhen';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, resolve  } from 'pathe';
import { RouterRegistry } from '../Services/Router/RouterRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import type { BasePlugin } from '../Services/Plugins/BasePlugin';
import { ConfigTypes } from '../Types/ConfigTypes';
import { ErrorHandlerProvider } from '../Services/ErrorHandler/ErrorHandlerProvider';

/**
 * Represents the main application class.
 */
export class App {

  @Inject(RouterRegistry)
  private gRouterRegistry!: RouterRegistry;

  @Inject(PluginsRegistry)
  private gPluginsRegistry!: PluginsRegistry;

  @Inject(ErrorHandlerProvider)
  private gErrorHandler!: ErrorHandlerProvider;

  /** Holds H3 app instance */
  private fH3App!: H3App;

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
    this.fH3App = createApp({
      debug: this.fConfig.dev,
      onError: async (error, event) => {
        await this.gErrorHandler.handleError(error, event);
      },
    });
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

    // resolve routes
    this.resolveRoutes();

    // resolve plugins
    await this.resolvePlugins();

    // initialize container with all decorators
    initializeContainer(this.container);

    // start listening
    await listen(toNodeListener(this.fH3App), { port: this.fConfig?.server?.port ?? 3000 });
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

  /**
   * Initializes the static server for the application.
   *
   * @private
   */
  private initializeStaticServer(): void {
    const staticDirs = (this.fConfig?.server?.staticDirs || ['public'])
      .filter(Boolean)
      .map((d) => resolve(process.cwd(), d))
      .filter((d) => existsSync(d) && statSync(d).isDirectory());

    for (const dir of staticDirs) {
      this.fH3App.use(
        eventHandler(async (event) => {
          await serveStatic(event, {
            fallthrough: true,
            getContents: (id) => readFile(join(dir, id)),
            getMeta: async (id) => {
              const stats = await stat(join(dir, id)).catch(() => {});
              if (!stats || !stats.isFile()) {
                return;
              }
              return {
                size: stats.size,
                mtime: stats.mtimeMs,
              };
            },
          });
        }),
      );
    }
  }

}
