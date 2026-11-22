import { Container, Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { serve } from 'srvx';
import { tryServeSpaIndex } from '../../Common/ServeStatic';
import { MethodNotAllowedError } from '../../Errors/Http/MethodNotAllowedError';
import { NotFoundError } from '../../Errors/Http/NotFoundError';
import { withoutStack } from '../../Utils/Errors';
import { getRequestPathname } from '../../Utils/Url';
import { ResponseCompressor } from '../Compression/ResponseCompressor';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { RequestHandler } from '../Router/RequestHandler';
import { Router } from '../Router/Router';
import { StaticRequestHandler } from '../Router/StaticRequestHandler';
import { TelemetryRegistry } from '../Telemetry/TelemetryRegistry';
import type { ConfigTypes } from '../../Types/ConfigTypes';
import type { TelemetryTypes } from '../../Types/TelemetryTypes';
import type { Server, ServerPlugin } from 'srvx';

/** How often a closing Node server closes the keep-alive connections that became idle. */
const IDLE_SWEEP_INTERVAL = 50;

/**
 * Whether the current runtime/platform can bind a socket with `SO_REUSEPORT`.
 *
 * Linux is the only platform where the flag actually load-balances incoming
 * connections across processes. Elsewhere it is either ignored (Deno) or
 * outright rejected - Node on macOS fails `listen()` with `ENOTSUP`, and no
 * runtime implements it on Windows - so it is only requested on Linux.
 *
 * @returns {boolean} True when `reusePort` can be safely requested.
 */
function isReusePortSupported(): boolean {
  const deno = (globalThis as { Deno?: { build?: { os?: string } } }).Deno;
  const platform = deno?.build?.os ?? (typeof process === 'undefined' ? undefined : process.platform);

  return platform === 'linux';
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
   * Whether {@link HttpServer.listen} bound the server
   * @private
   */
  private fListening: boolean = false;

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
   * Cached telemetry hooks (`null` when no telemetry package is installed).
   * @private
   */
  private fTelemetry: TelemetryTypes.Hooks | null | undefined;

  /**
   * Compresses responses, `null` while compression is off.
   * @private
   */
  private fCompressor: ResponseCompressor | null = null;

  /**
   * Whether the server is bound and accepting connections. False before
   * `listen()`, once `close()` began, and when the application is driven
   * through `app.fetch()` alone.
   */
  public get listening(): boolean {
    return this.fListening;
  }

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
   * Turns response compression off, whatever the configuration says. For a
   * platform that compresses responses itself, or one that cannot carry a
   * compressed body: the serverless adapters call it where that is the case.
   *
   * @returns {void}
   */
  public disableCompression(): void {
    this.fCompressor = null;
    this.gStaticRequestHandler.setPrecompressed(null);
  }

  /**
   * The encodings responses are compressed with, most preferred first. Empty
   * while compression is off.
   *
   * @returns {readonly ConfigTypes.CompressionEncoding[]} The encodings
   */
  public get compressionEncodings(): readonly ConfigTypes.CompressionEncoding[] {
    return this.fCompressor?.encodings ?? [];
  }

  /**
   * Initializes the HTTP server and starts listening for requests
   *
   * @returns {Promise<void>} A promise that resolves when the server is ready
   */
  public async initialize(config: ConfigTypes.Config): Promise<void> {
    const { port, host, reusePort } = config.server ?? {};

    const compressor = await ResponseCompressor.create(config.compression);

    this.fCompressor = compressor;
    this.gStaticRequestHandler.setPrecompressed(compressor?.precompressed ? (header) => compressor.accepted(header) : null);

    this.fServer = serve({
      bun: {
        error: (error: Error) => {
          return this.gContainer.get(ErrorHandlerProvider).handleError(error);
        },
      },
      deno: {
        onError: (error: unknown) => {
          const _error = error instanceof Error ? error : new Error(String(error));
          return this.gContainer.get(ErrorHandlerProvider).handleError(_error);
        },
      },
      hostname: host,
      // SO_REUSEPORT only balances connections on Linux, and Node on Darwin even
      // fails `listen()` with ENOTSUP when it is set - see isReusePortSupported.
      // Config can still force it on or off.
      reusePort: reusePort ?? isReusePortSupported(),
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

    this.fListening = true;

    // A listening server stays around to write what it logged, so the logger
    // may write once per turn of the event loop instead of once per request.
    // Not done for an application driven through `app.fetch()` alone: a
    // serverless platform may freeze the process the moment it has answered.
    this.gContainer.getOptional(Logger)?.bufferOutput?.();
  }

  /**
   * Stops accepting connections and waits for the requests in flight. Once
   * `timeout` elapses, the connections still open are closed. Does nothing
   * when the server never listened, as with `app.fetch()` alone.
   *
   * @param {number} [timeout] - Milliseconds to wait for requests in flight, unbounded when omitted
   * @returns {Promise<void>} Resolves once the server is closed
   */
  public async close(timeout?: number): Promise<void> {
    if (!this.fListening) {
      return;
    }

    this.fListening = false;

    const closing = this.fServer.close();

    // Node waits for idle keep-alive connections to time out, and a connection
    // only becomes idle once its request is answered: keep closing them until
    // the server is closed. Bun and Deno close idle connections themselves.
    const node = this.fServer.node?.server as { closeIdleConnections?: () => void } | undefined;
    const sweep = node?.closeIdleConnections ? setInterval(() => node.closeIdleConnections?.(), IDLE_SWEEP_INTERVAL) : undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const expired = new Promise<true>((resolve) => {
      if (timeout !== undefined) {
        timer = setTimeout(() => resolve(true), timeout);
      }
    });

    try {
      if ((await Promise.race([closing, expired])) === true) {
        await this.fServer.close(true);
      }
    } finally {
      clearTimeout(timer);
      clearInterval(sweep);
      this.gContainer.getOptional(Logger)?.flush?.();
    }
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
    // read once: with compression off this comparison is all a request pays for it
    const compressor = this.fCompressor;

    try {
      const route = this.gRouter.match(request.method, getRequestPathname(request));

      if (route) {
        const response = this.gRequestHandler.handleRequest(request, route);

        if (compressor === null || route.data.compression === false) {
          return response;
        }

        return this.compressed(compressor.apply(request, response, route.data.compression));
      }

      // handle preflight request
      if (request.method === 'OPTIONS') {
        return this.gRequestHandler.handlePreflight(request);
      }

      // no route matched - static assets and the SPA fallback are the slow path
      const telemetry = this.telemetry;
      const response =
        telemetry === null
          ? this.handleUnmatchedRequest(request)
          : telemetry.server({ request, name: request.method }, () => this.handleUnmatchedRequest(request));

      return compressor === null ? response : this.compressed(compressor.apply(request, response));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Hands a failure of the compressor to the error handler. Deciding about a
   * body of unknown size means reading it, and a body that fails while it is
   * read has to end as an error response like any other failure.
   *
   * @param {Response | Promise<Response>} response - What the compressor returned
   * @returns {Response | Promise<Response>} The same, with a rejection turned into an error response
   * @private
   */
  private compressed(response: Response | Promise<Response>): Response | Promise<Response> {
    return response instanceof Response ? response : response.catch((error) => this.handleError(error));
  }

  /**
   * Handles a request that did not match any route by trying the static file
   * handler, then answering 405 for a path routed under other methods, then
   * the SPA `index.html` fallback, before giving up with a 404. All of it runs
   * through the global middlewares, like a routed request.
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {Response | Promise<Response>} The HTTP response, synchronous when no file can answer it
   * @private
   */
  private handleUnmatchedRequest(request: Request): Response | Promise<Response> {
    // Nothing to look for on disk: the answer is a 404 or a 405, and it is
    // known without awaiting anything.
    if (this.fSpaPublicDir === undefined && !this.gStaticRequestHandler.handles(request)) {
      return this.gRequestHandler.handleMiss(request, this.gRouter.allowedMethods(getRequestPathname(request)));
    }

    return this.gRequestHandler.handleUnmatched(request, async (response) => {
      const staticResponse = await this.gStaticRequestHandler.handleRequest(request);

      if (staticResponse) {
        return staticResponse;
      }

      const allowed = this.gRouter.allowedMethods(getRequestPathname(request));

      if (allowed.length > 0) {
        response.headers.set('allow', allowed.join(', '));
        throw withoutStack(() => new MethodNotAllowedError('Method not allowed'));
      }

      const spaResponse = await tryServeSpaIndex(request, this.fSpaPublicDir);

      if (spaResponse) {
        return spaResponse;
      }

      throw withoutStack(() => new NotFoundError('Route not found'));
    });
  }

  /**
   * Delegates an unknown failure to the configured error handler.
   *
   * @param {unknown} error - The thrown value
   * @returns {Response | Promise<Response>} The error response
   * @private
   */
  private handleError(error: unknown): Response | Promise<Response> {
    this.telemetry?.recordError(error);

    return this.gContainer.get(ErrorHandlerProvider).handleError(error instanceof Error ? error : new Error(String(error)));
  }

  /**
   * Returns the installed telemetry hooks, or `null` when telemetry is off.
   *
   * Resolved once and cached, so a telemetry package has to install itself
   * during application setup.
   *
   * @returns {TelemetryTypes.Hooks | null} The telemetry hooks
   * @private
   */
  private get telemetry(): TelemetryTypes.Hooks | null {
    if (this.fTelemetry === undefined) {
      this.fTelemetry = this.gContainer.getOptional(TelemetryRegistry)?.hooks ?? null;
    }

    return this.fTelemetry;
  }
}
