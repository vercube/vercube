import { Inject } from '@vercube/di';
import { serve, type Server} from 'srvx';
import { Router } from '../Router/Router';
import { RequestHandler } from '../Router/RequestHandler';
import { ConfigTypes } from 'packages/core/dist';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';

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
   * Error handler provider for managing error responses
   */
  @Inject(ErrorHandlerProvider)
  private gErrorHandlerProvider: ErrorHandlerProvider;

  /**
   * Underlying server instance
   * @private
   */
  private fServer: Server;

  /**
   * Initializes the HTTP server and starts listening for requests
   * 
   * @returns {Promise<void>} A promise that resolves when the server is ready
   */
  public async initialize(config: ConfigTypes.Config): Promise<void> {
    const { port, host } = config.server ?? {};

    this.fServer = serve({
      bun: {
        error(error: Error) {
          return this.gErrorHandlerProvider.handleError(error);
        },
      },
      deno: {
        onError(error: Error) {
          return this.gErrorHandlerProvider.handleError(error);
        },
      },
      hostname: host,
      port,
      fetch: this.handleRequest.bind(this),
    });

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
  private async handleRequest(request: Request): Promise<Response> {
    const route = this.gRouter.resolve({ path: request.url, method: request.method });

    if (!route) {
      return new Response(JSON.stringify({ message: 'Route not found', statusCode: 404 }, null, 2), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return this.gRequestHandler.handleRequest(request, route);
  }
}