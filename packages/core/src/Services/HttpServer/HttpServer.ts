import { Container, Inject } from '@vercube/di';
import { ConfigTypes, NotFoundError } from '@vercube/core';
import { serve, type Server, type ServerPlugin } from 'srvx';
import { Router } from '../Router/Router';
import { RequestHandler } from '../Router/RequestHandler';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { StaticRequestHandler } from '../Router/StaticRequestHandler';
import { ServerPlugins } from './ServerPlugins';
/**
 * HTTP server implementation for handling incoming web requests
 * 
 * This class is responsible for:
 * - Initializing and managing the HTTP server
 * - Routing incoming requests to appropriate handlers
 * - Processing HTTP responses
 */
export class HttpServer {

  /**
   * DI container for resolving dependencies
   */
  @Inject(Container)
  private gContainer: Container;

  /**
   * Router service for resolving routes
   */
  @Inject(Router)
  private gRouter: Router;

  /**
   * Handler for processing HTTP requests
   */
  @Inject(RequestHandler)
  private gRequestHandler: RequestHandler;

  /**
   * Static server for serving static files
   */
  @Inject(StaticRequestHandler)
  private gStaticRequestHandler: StaticRequestHandler;

  /**
   * Server Plugins for getting the plugins for the HTTP server
   */
  @Inject(ServerPlugins)
  private gServerPlugins: ServerPlugins;

  /**
   * Underlying server instance
   * @private
   */
  private fServer: Server;

  /**
   * List of plugins to be applied to the HTTP server
   * @private
   */
  private fPlugins: ServerPlugin[] = [];

  /**
   * Adds a plugin to the HTTP server
   * 
   * @param {ServerPlugin} plugin - The plugin to add
   * @returns {void}
   */
  public addPlugin(plugin: ServerPlugin): void {
    this.fPlugins.push(plugin);
  }

  /**
   * Initializes the HTTP server and starts listening for requests
   * 
   * @returns {Promise<void>} A promise that resolves when the server is ready
   */
  public async initialize(config: ConfigTypes.Config): Promise<void> {
    const { port, host } = config.server ?? {};

    this.fServer = serve({
      bun: {
        error: (error: Error) => {
          return this.gContainer.get(ErrorHandlerProvider).handleError(error);
        },
      },
      deno: {
        onError: (error: Error) => {
          return this.gContainer.get(ErrorHandlerProvider).handleError(error);
        },
      },
      hostname: host,
      port,
      fetch: this.handleRequest.bind(this),
      plugins: this.gServerPlugins.serverPlugins,
    });
  }

  /**
   * Listens for incoming requests on the HTTP server
   * 
   * @returns {Promise<void>} A promise that resolves when the server is ready to listen
   */
  public async listen(): Promise<void> {
    await this.fServer.ready();
  }

  /**
   * Processes an incoming HTTP request
   * 
   * This method:
   * 1. Resolves the route for the request
   * 2. Returns a 404 response if no route is found
   * 3. Delegates to the request handler for matched routes
   * 
   * @param {Request} request - The incoming HTTP request
   * @returns {Promise<Response>} The HTTP response
   * @private
   */
  public async handleRequest(request: Request): Promise<Response> {
    try {
      const route = this.gRouter.resolve({ path: request.url, method: request.method });

      // if no route is found, try to serve static file
      if (!route) {
        const response = await this.gStaticRequestHandler.handleRequest(request);

        if (response) {
          return response;
        } else {
          throw new NotFoundError('Route not found');
        }
      }

      return this.gRequestHandler.handleRequest(request, route);
    } catch (error) {
      return this.gContainer.get(ErrorHandlerProvider).handleError(error);
    }

  }
}