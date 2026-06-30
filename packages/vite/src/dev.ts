import { watch as chokidarWatch } from 'chokidar';
import { createViteHotChannel } from 'env-runner/vite';
import { addRoute, createRouter, findRoute } from 'rou3';
import { NodeRequest, sendNodeResponse } from 'srvx/node';
import { DevEnvironment } from 'vite';
import { scanProject } from './context';
import { VERCUBE_ENV } from './types';
import type { VercubePluginContext } from './types';
import type { RouteInfo } from '@vercube/scan';
import type { RunnerRPCHooks } from 'env-runner';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DevEnvironmentContext, ResolvedConfig, ViteDevServer } from 'vite';

/**
 * The subset of the env-runner manager the fetchable environment relies on:
 * the module-runner RPC hooks plus a request dispatcher.
 */
export interface DevServer extends RunnerRPCHooks {
  fetch: (req: Request) => Promise<Response>;
  init?: () => void | Promise<void>;
}

/** Chokidar events that imply a controller/service was added or removed. */
const RELOAD_EVENTS = new Set(['add', 'addDir', 'unlink', 'unlinkDir']);

/**
 * Creates a {@link FetchableDevEnvironment} wired to the env-runner worker via a
 * Vite hot channel.
 *
 * @param name - The environment name.
 * @param config - The resolved Vite config.
 * @param devServer - The env-runner manager driving the worker.
 * @param entry - The dev entry the worker should import for this environment.
 * @returns The fetchable dev environment.
 */
export function createFetchableDevEnvironment(
  name: string,
  config: ResolvedConfig,
  devServer: DevServer,
  entry: string,
): FetchableDevEnvironment {
  const context: DevEnvironmentContext = { hot: true, transport: createViteHotChannel(devServer, name) };
  return new FetchableDevEnvironment(name, config, context, devServer, entry);
}

/**
 * A Vite `DevEnvironment` that can dispatch HTTP requests into the server code
 * running inside the env-runner worker. On `init` it tells the worker which
 * entry module backs this environment.
 */
export class FetchableDevEnvironment extends DevEnvironment {
  public devServer: DevServer;
  readonly #entry: string;

  constructor(name: string, config: ResolvedConfig, context: DevEnvironmentContext, devServer: DevServer, entry: string) {
    super(name, config, context);
    this.devServer = devServer;
    this.#entry = entry;
  }

  /**
   * Dispatches a web `Request` into the worker and resolves with its `Response`.
   *
   * @param request - The incoming request.
   * @returns The server response.
   */
  public async dispatchFetch(request: Request): Promise<Response> {
    return this.devServer.fetch(request);
  }

  public override async init(...args: Parameters<DevEnvironment['init']>): Promise<void> {
    await this.devServer.init?.();
    await super.init(...args);
    this.devServer.sendMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: this.name, entry: this.#entry },
    });
  }
}

/**
 * Wires the Vercube environment into a Vite dev server: forwards HTTP requests
 * into the worker and watches the scan directories so added/removed controllers
 * are re-discovered without a manual restart.
 *
 * The request middleware is installed eagerly (before Vite's own middlewares)
 * so matched API routes are claimed ahead of Vite's SPA/HTML fallback; every
 * other request falls through to Vite.
 *
 * @param ctx - The shared plugin context.
 * @param server - The Vite dev server.
 */
export async function configureViteDevServer(ctx: VercubePluginContext, server: ViteDevServer): Promise<void> {
  const env = server.environments[VERCUBE_ENV] as FetchableDevEnvironment;

  // Only requests matching a discovered Vercube route are handed to the worker;
  // everything else (the frontend, assets, Vite internals) is left to Vite. The
  // matcher is rebuilt whenever controllers change.
  let matchesRoute = buildRouteMatcher(ctx.routes);

  // Re-discover controllers/services on add/remove and reload the worker.
  const reload = debounce(async () => {
    await scanProject(ctx);
    matchesRoute = buildRouteMatcher(ctx.routes);
    env.moduleGraph.invalidateAll();
    env.hot.send({ type: 'full-reload' });
  });

  const watcher = chokidarWatch(ctx.scanDirs, { ignoreInitial: true }).on('all', (event) => {
    if (RELOAD_EVENTS.has(event)) {
      reload();
    }
  });
  server.httpServer?.once('close', () => {
    void watcher.close();
    void ctx._envRunner?.close();
  });

  // Forward WebSocket upgrades into the worker, where the Vercube app handles
  // them via `@vercube/ws`. Vite's own HMR socket (identified by a `vite-*`
  // sub-protocol) is left to Vite.
  server.httpServer?.on('upgrade', (req, socket, head) => {
    const protocol = req.headers['sec-websocket-protocol'];
    if (typeof protocol === 'string' && protocol.startsWith('vite-')) {
      return;
    }
    void ctx._envRunner?.upgrade?.({ node: { req, socket, head } } as Parameters<
      NonNullable<typeof ctx._envRunner>['upgrade']
    >[0]);
  });

  const middleware = async (
    nodeReq: IncomingMessage,
    nodeRes: ServerResponse,
    next: (error?: unknown) => void,
  ): Promise<void> => {
    // Hand the request to Vercube only when its path matches a defined route;
    // otherwise let Vite serve it (frontend, assets, HMR, Vite internals).
    if (!nodeReq.url || !matchesRoute(nodeReq.url)) {
      return next();
    }
    try {
      const request = new NodeRequest({ req: nodeReq, res: nodeRes });
      const response = await env.dispatchFetch(request);
      if (nodeRes.writableEnded || nodeRes.headersSent) {
        return;
      }
      await sendNodeResponse(nodeRes, response);
    } catch (error) {
      next(error);
    }
  };

  server.middlewares.use(middleware);
}

/**
 * Builds a predicate that tells whether a request URL matches any discovered
 * Vercube route, using the same `rou3` router the framework uses at runtime so
 * params (`:id`) and wildcards (`**`) match identically. Matching is
 * method-agnostic: every method (and CORS preflight) for a defined path is
 * Vercube's, so it can answer `405`/`OPTIONS` itself.
 *
 * @param routes - The discovered HTTP routes.
 * @returns A predicate `(url) => boolean`.
 */
function buildRouteMatcher(routes: RouteInfo[]): (url: string) => boolean {
  const router = createRouter<true>();
  const seen = new Set<string>();
  for (const { route } of routes) {
    if (seen.has(route)) {
      continue;
    }
    seen.add(route);
    addRoute(router, 'ANY', route, true);
  }

  return (url) => {
    // Match on the path only, normalising a trailing slash (routes are stored
    // without one) so `/api/users/` matches `/api/users`.
    const pathname = url.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
    return findRoute(router, 'ANY', pathname) !== undefined;
  };
}

/**
 * Minimal trailing debounce: coalesces bursts of file events into a single
 * reload on the next tick.
 */
function debounce(fn: () => void | Promise<void>, delay = 50): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void fn();
    }, delay);
  };
}
