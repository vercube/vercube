import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpServer } from '@vercube/core';
import { ServerlessErrors } from '../../Errors/Catalog';
import { flushTelemetry } from '../../Utils/flush';
import type { App, MaybePromise } from '@vercube/core';

/**
 * What Netlify hands a function next to the request. The fields are the ones
 * of `Context` in `@netlify/functions`, which types them in full: use that
 * type as `T` to get them (`NetlifyContext<Context>`).
 */
export interface NetlifyRequestContext {
  /** Keeps the invocation alive for work that outlasts the response. */
  waitUntil?(promise: Promise<unknown>): void;
  [key: string]: unknown;
}

/**
 * One store for every handler of the process. Registered globally, so the
 * bundle of an application and a copy of this module loaded beside it read the
 * same request.
 */
const STORAGE_KEY = Symbol.for('vercube.netlify.context');

const storage: AsyncLocalStorage<NetlifyRequestContext> = ((globalThis as Record<symbol, unknown>)[STORAGE_KEY] ??=
  new AsyncLocalStorage<NetlifyRequestContext>()) as AsyncLocalStorage<NetlifyRequestContext>;

/** The context of a request that arrived without one. */
const DETACHED: NetlifyRequestContext = Object.freeze({});

/**
 * The Netlify context of the request being handled: where the visitor is
 * (`geo`), their address (`ip`), the deploy and site, and `waitUntil()`.
 *
 * @example
 * ```ts
 * import type { Context } from '@netlify/functions';
 *
 * @Controller('/where')
 * export class WhereController {
 *   @Inject(NetlifyContext)
 *   private netlify!: NetlifyContext<Context>;
 *
 *   @Get('/')
 *   public where(): { country?: string } {
 *     return { country: this.netlify.context.geo?.country?.code };
 *   }
 * }
 * ```
 */
export class NetlifyContext<T extends object = NetlifyRequestContext> {
  /**
   * The context Netlify passed with the request.
   *
   * @throws {Error} Outside a request handled by the Netlify adapter
   */
  public get context(): T {
    const context = storage.getStore();

    if (!context) {
      throw ServerlessErrors.NETLIFY_CONTEXT_OUTSIDE_REQUEST();
    }

    return context as T;
  }

  /** Whether a request handled by the Netlify adapter is in progress. */
  public get active(): boolean {
    return storage.getStore() !== undefined;
  }

  /**
   * Keeps the invocation alive until the promise settles, after the response
   * was sent. Where the platform offers no such hook the work is left to
   * finish by itself.
   *
   * @param {Promise<unknown>} promise - The work to wait for
   * @returns {void}
   */
  public waitUntil(promise: Promise<unknown>): void {
    keepAlive(this.context as NetlifyRequestContext, promise);
  }
}

/** A Netlify Function: the default export of a file in `netlify/functions`. */
export type NetlifyHandler = (request: Request, context?: object) => Promise<Response>;

/**
 * Turns a Vercube application into a Netlify Function (the Web `Request` /
 * `Response` signature of Functions 2.0):
 *
 * @example
 * ```ts
 * // src/index.ts
 * export const netlify: NetlifyHandler = toServerlessHandler(app);
 *
 * // netlify/functions/api.mts
 * import { netlify } from '../../dist/index.mjs';
 *
 * export default netlify;
 * export const config = { path: '/*', preferStatic: true };
 * ```
 *
 * Pass a function instead of the application to create it on the first
 * request.
 *
 * @param {App | (() => MaybePromise<App>)} app - The application, or a function that creates it
 * @returns {NetlifyHandler} The function's default export
 */
export function toServerlessHandler(app: App | (() => MaybePromise<App>)): NetlifyHandler {
  let ready: Promise<App> | undefined;

  const prepare = async (): Promise<App> => {
    const instance = typeof app === 'function' ? await app() : app;

    // Netlify's CDN compresses responses, and negotiates the encoding itself
    instance.container.get(HttpServer).disableCompression();

    return instance;
  };

  return async (request: Request, context?: object): Promise<Response> => {
    // a failed start is retried by the next request instead of being remembered
    const instance = await (ready ??= prepare().catch((error: unknown) => {
      ready = undefined;

      throw error;
    }));

    // typed loosely: `Context` of `@netlify/functions` is an interface without an index signature
    const scope = (context as NetlifyRequestContext | undefined) ?? DETACHED;
    const response = await storage.run(scope, () => instance.fetch(request));

    // spans still buffered when the response leaves would be lost with the invocation
    keepAlive(scope, flushTelemetry(instance));

    return response;
  };
}

/**
 * Hands work that outlasts the response to the platform, or lets it finish by
 * itself where there is nobody to hand it to.
 *
 * @param {NetlifyRequestContext} context - The context of the request
 * @param {Promise<unknown>} promise - The work
 * @returns {void}
 */
function keepAlive(context: NetlifyRequestContext, promise: Promise<unknown>): void {
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(promise);

    return;
  }

  promise.catch(() => {});
}
