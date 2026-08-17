import { Container, Inject } from '@vercube/di';
import { serve } from 'srvx';
import { tryServeSpaIndex } from '../../Common/ServeStatic';
import { NotFoundError } from '../../Errors/Http/NotFoundError';
import { getRequestPathname } from '../../Utils/Url';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { RequestHandler } from '../Router/RequestHandler';
import { Router } from '../Router/Router';
import { StaticRequestHandler } from '../Router/StaticRequestHandler';
import type { ConfigTypes } from '../../Types/ConfigTypes';
import type { Server, ServerPlugin } from 'srvx';

/**
 * Whether the current runtime/platform can bind a socket with `SO_REUSEPORT`.
 *
 * Node on macOS rejects `listen()` with `ENOTSUP` when `reusePort` is set,
 * which makes the server unable to start at all. Bun and Deno implement it
 * on every platform they support.
 *
 * @returns {boolean} True when `reusePort` can be safely requested.
 */
function isReusePortSupported(): boolean {
  const globals = globalThis as { Bun?: unknown; Deno?: unknown };

  if (globals.Bun || globals.Deno) {
    return true;
  }

  return typeof process === 'undefined' ? false : process.platform !== 'darwin';
}

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
  private gContainer!: Container;

  /**
   * Router service for resolving routes
   */
  @Inject(Router)
  private gRouter!: Router;

  /**
   * Handler for processing HTTP requests
   */
  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  /**
   * Static server for serving static files
   */
  @Inject(StaticRequestHandler)
  private gStaticRequestHandler!: StaticRequestHandler;

  /**
   * Underlying server instance
   * @private
   */
  private fServer!: Server;

  /**
   * List of plugins to be applied to the HTTP server
   * @private
   */
  private fPlugins: ServerPlugin[] = [];

  /**
   * Built frontend directory used for SPA `index.html` fallback.
   * @private
   */
  private fSpaPublicDir?: string;

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
   * Enables SPA fallback to `index.html` from `publicDir` for unmatched
   * frontend navigations after API routes and static handlers are tried.
   *
   * @param publicDir - Absolute path to the built frontend directory.
   */
  public enableSpaFallback(publicDir: string): void {
    this.fSpaPublicDir = publicDir;
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
      // SO_REUSEPORT is not supported by Node on Darwin (listen fails with ENOTSUP),
      // so it can only be enabled on platforms that actually implement it.
      reusePort: isReusePortSupported(),
      port,
      fetch: this.handleRequest.bind(this),
      plugins: this.fPlugins,
      manual: true,
    });
  }

  /**
   * Listens for incoming requests on the HTTP server
   *
   * @returns {Promise<void>} A promise that resolves when the server is ready to listen
   */
  public async listen(): Promise<void> {
    await this.fServer.serve();
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
   * The return type is deliberately not `Promise<Response>`: routes that are
   * fully synchronous return a plain `Response`, which lets srvx write it out
   * without scheduling a microtask.
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  public handleRequest(request: Request): Response | Promise<Response> {
    try {
      const route = this.gRouter.match(request.method, getRequestPathname(request));

      if (route) {
        return this.gRequestHandler.handleRequest(request, route);
      }

      // handle preflight request
      if (request.method === 'OPTIONS') {
        return this.gRequestHandler.handlePreflight(request);
      }

      // no route matched - static assets and the SPA fallback are the slow path
      return this.handleUnmatchedRequest(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handles a request that did not match any route by trying the static file
   * handler and the SPA `index.html` fallback before giving up with a 404.
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {Promise<Response>} The HTTP response
   * @private
   */
  private async handleUnmatchedRequest(request: Request): Promise<Response> {
    try {
      const response = await this.gStaticRequestHandler.handleRequest(request);

      if (response) {
        return response;
      }

      const spaResponse = await tryServeSpaIndex(request, this.fSpaPublicDir);
      if (spaResponse) {
        return spaResponse;
      }

      throw new NotFoundError('Route not found');
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delegates an unknown failure to the configured error handler.
   *
   * @param {unknown} error - The thrown value
   * @returns {Response | Promise<Response>} The error response
   * @private
   */
  private handleError(error: unknown): Response | Promise<Response> {
    return this.gContainer.get(ErrorHandlerProvider).handleError(error instanceof Error ? error : new Error(String(error)));
  }
}
