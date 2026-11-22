import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpServer } from '@vercube/core';
import { flushTelemetry } from '../../Utils/flush';
import type { App, MaybePromise } from '@vercube/core';

/**
 * What Cloudflare hands a Worker next to the request: `waitUntil()` keeps the
 * invocation alive for work that outlasts the response.
 */
export interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

/** The bindings and execution context of the request being handled. */
interface CloudflareScope<Env> {
  env: Env;
  ctx: CloudflareExecutionContext;
}

/**
 * One store for every handler of the isolate. Registered globally, so the
 * bundle of an application and a copy of this module loaded beside it read the
 * same request.
 */
const STORAGE_KEY = Symbol.for('vercube.cloudflare.scope');

const storage: AsyncLocalStorage<CloudflareScope<unknown>> = ((globalThis as Record<symbol, unknown>)[STORAGE_KEY] ??=
  new AsyncLocalStorage<CloudflareScope<unknown>>()) as AsyncLocalStorage<CloudflareScope<unknown>>;

/**
 * The Cloudflare bindings and execution context of the request being handled.
 *
 * Bindings (KV, R2, D1, Durable Objects, queues, secrets and variables) belong
 * to a request on Workers: there is no module-level `env`. Inject this service
 * and read them where they are used:
 *
 * @example
 * ```ts
 * interface Env {
 *   CACHE: KVNamespace;
 * }
 *
 * @Controller('/visits')
 * export class VisitsController {
 *   @Inject(CloudflareBindings)
 *   private cloudflare!: CloudflareBindings<Env>;
 *
 *   @Get('/')
 *   public async count(): Promise<{ visits: number }> {
 *     const visits = Number(await this.cloudflare.env.CACHE.get('visits')) + 1;
 *
 *     this.cloudflare.waitUntil(this.cloudflare.env.CACHE.put('visits', String(visits)));
 *
 *     return { visits };
 *   }
 * }
 * ```
 */
export class CloudflareBindings<Env = Record<string, unknown>> {
  /**
   * The bindings declared in `wrangler.jsonc`.
   *
   * @throws {Error} Outside a request handled by the Cloudflare adapter
   */
  public get env(): Env {
    return this.scope.env;
  }

  /**
   * The execution context of the request.
   *
   * @throws {Error} Outside a request handled by the Cloudflare adapter
   */
  public get ctx(): CloudflareExecutionContext {
    return this.scope.ctx;
  }

  /** Whether a request handled by the Cloudflare adapter is in progress. */
  public get active(): boolean {
    return storage.getStore() !== undefined;
  }

  /**
   * Keeps the invocation alive until the promise settles, after the response
   * was sent: for a cache write, an analytics call, a log flush.
   *
   * @param {Promise<unknown>} promise - The work to wait for
   * @returns {void}
   */
  public waitUntil(promise: Promise<unknown>): void {
    this.scope.ctx.waitUntil(promise);
  }

  private get scope(): CloudflareScope<Env> {
    const scope = storage.getStore();

    if (!scope) {
      // bare-error: migrated with the serverless catalog
      throw new Error(
        'CloudflareBindings was read outside a request. Bindings exist only while the Cloudflare adapter handles a request.',
      );
    }

    return scope as CloudflareScope<Env>;
  }
}

/** The execution context of a request that arrived without one: the work is simply left to finish. */
const DETACHED: CloudflareExecutionContext = Object.freeze({
  waitUntil(promise: Promise<unknown>): void {
    promise.catch(() => {});
  },
});

/** What a Worker module exports as its default. */
export interface CloudflareHandler<Env = Record<string, unknown>> {
  fetch(request: Request, env?: Env, ctx?: CloudflareExecutionContext): Promise<Response>;
}

/**
 * Turns a Vercube application into the default export of a Cloudflare Worker
 * (or of a Pages Function):
 *
 * @example
 * ```ts
 * const app = await createApp({ cfg: config, configFile: false });
 *
 * export default toServerlessHandler(app);
 * ```
 *
 * Pass a function instead of the application to create it on the first
 * request, for an application whose setup does something Workers only allow
 * inside a request (a `fetch()`, a timer, a random value):
 *
 * @example
 * ```ts
 * export default toServerlessHandler(() => createApp({ cfg: config, configFile: false }));
 * ```
 *
 * @param {App | (() => MaybePromise<App>)} app - The application, or a function that creates it
 * @returns {CloudflareHandler<Env>} The module's default export
 */
export function toServerlessHandler<Env = Record<string, unknown>>(app: App | (() => MaybePromise<App>)): CloudflareHandler<Env> {
  let ready: Promise<App> | undefined;

  const prepare = async (): Promise<App> => {
    const instance = typeof app === 'function' ? await app() : app;

    // Cloudflare compresses responses at the edge, and negotiates the encoding itself
    instance.container.get(HttpServer).disableCompression();

    if (!instance.container.getOptional(CloudflareBindings)) {
      instance.container.bind(CloudflareBindings);
    }

    return instance;
  };

  return {
    async fetch(request: Request, env?: Env, ctx?: CloudflareExecutionContext): Promise<Response> {
      // a failed start is retried by the next request instead of being remembered
      const instance = await (ready ??= prepare().catch((error: unknown) => {
        ready = undefined;

        throw error;
      }));

      // Anything that drives the module through its default export may call
      // it with the request alone: `vercube dev`, a test. There are no
      // bindings then, and nothing to keep alive.
      const scope: CloudflareScope<Env> = { env: env ?? ({} as Env), ctx: ctx ?? DETACHED };
      const response = await storage.run(scope, () => instance.fetch(request));

      // spans still buffered when the response leaves would be lost with the isolate
      scope.ctx.waitUntil(flushTelemetry(instance));

      return response;
    },
  };
}

/** What Cloudflare Pages hands a function. */
export interface CloudflarePagesContext<Env = Record<string, unknown>> extends CloudflareExecutionContext {
  request: Request;
  env: Env;
}

/**
 * Turns a Vercube application into a Cloudflare Pages Function. Put it in
 * `functions/[[path]].ts`, so every path that is not a static file of the
 * Pages project reaches the application:
 *
 * @example
 * ```ts
 * // functions/[[path]].ts
 * import { app } from '../src/index';
 * import { toPagesFunction } from '@vercube/serverless/cloudflare';
 *
 * export const onRequest = toPagesFunction(app);
 * ```
 *
 * @param {App | (() => MaybePromise<App>)} app - The application, or a function that creates it
 * @returns {(context: CloudflarePagesContext<Env>) => Promise<Response>} The `onRequest` export
 */
export function toPagesFunction<Env = Record<string, unknown>>(
  app: App | (() => MaybePromise<App>),
): (context: CloudflarePagesContext<Env>) => Promise<Response> {
  const handler = toServerlessHandler<Env>(app);

  return (context) => handler.fetch(context.request, context.env, context);
}
