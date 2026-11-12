import type { MaybePromise, RequestContext } from '@vercube/core';

export namespace RateLimitTypes {
  /** Milliseconds, or a string such as `'30s'`, `'1m'` or `'1h30m'`. */
  export type Duration = number | string;

  /**
   * - `fixed`: counts requests per window aligned to the clock. One storage
   *   write per request, but a client can make up to twice the limit across
   *   the boundary of two windows.
   * - `sliding`: weighs the previous window by how much of it still overlaps,
   *   which smooths the boundary. One write and one read per request.
   */
  export type Algorithm = 'fixed' | 'sliding';

  /** What a {@link Options.key} function receives. */
  export interface KeyContext {
    /** The request. */
    request: Request;
    /** The client address, as `trustProxy` allows reading it, or null when unknown. */
    ip: string | null;
    /**
     * The request context, where `@Auth()` keeps the authenticated user. Null
     * when the application turns both `requestContext` and `requestLogging` off.
     */
    context: RequestContext | null;
  }

  /** Options of one limit. */
  export interface Options {
    /** Requests allowed per window. */
    limit: number;

    /** Length of the window. */
    window: Duration;

    /** @default 'fixed' */
    algorithm?: Algorithm;

    /**
     * Who a request counts against. Returning null or undefined leaves the
     * request unlimited.
     * @default the client address
     */
    key?: (ctx: KeyContext) => MaybePromise<string | null | undefined>;

    /**
     * Storage mount the counters live in. A memory storage is mounted under the
     * name, with a warning, when nothing is.
     * @default 'default'
     */
    storage?: string;

    /**
     * What happens when the storage fails: `allow` lets the request through
     * and logs a warning, `deny` answers 503.
     * @default 'allow'
     */
    onStorageError?: 'allow' | 'deny';

    /**
     * Middleware priority. The default runs right after `@Auth()` (-999), so a
     * `key` function can read the user. Use a priority below -999 to limit
     * requests before authentication runs. In the config section it only
     * applies to the app-wide limit: a decorator's priority is fixed when the class is defined.
     * @default -900
     */
    priority?: number;

    /**
     * Sends `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` on
     * limited routes. `Retry-After` is always sent with a 429.
     * @default true
     */
    headers?: boolean;

    /**
     * Name of the counter. Routes with the same name share it. In the config
     * section it only names the app-wide limit.
     * @default `Controller.method`, `Controller` for a controller-wide limit, `global` for the app-wide one.
     * The controller is the route's own class, a subclass's name when it inherits the route.
     */
    name?: string;
  }

  /**
   * The `rateLimit` section of `vercube.config.ts`. Every field is a default
   * for `@RateLimit()`. With both `limit` and `window` it is also an app-wide
   * limit for every route that does not set its own.
   */
  export interface Config extends Partial<Options> {
    /**
     * How many proxies in front of the application to trust when reading the
     * client address from `x-forwarded-for`. See `getRequestIP()`.
     * @default false
     */
    trustProxy?: boolean | number;
  }

  /** Where a limit was declared, which decides its default counter name. */
  export type Scope = 'method' | 'controller' | 'global';

  /** What `@RateLimit()` and the plugin store on a route: the options with the window parsed. */
  export interface DeclaredOptions extends Partial<Omit<Options, 'window'>> {
    /** Length of the window in milliseconds, when the declaration sets one. */
    windowMs?: number;
    /** Where the limit was declared. */
    scope: Scope;
  }

  /** A limit with every default applied, what the manager counts against. */
  export interface ResolvedOptions {
    limit: number;
    windowMs: number;
    algorithm: Algorithm;
    key?: Options['key'];
    storage: string;
    onStorageError: 'allow' | 'deny';
    headers: boolean;
    name: string;
    trustProxy: boolean | number;
  }

  /** Outcome of counting one request. */
  export interface Result {
    /** Whether the request is within the limit. */
    allowed: boolean;
    /** The limit counted against. */
    limit: number;
    /** Requests left in the window, never below 0. */
    remaining: number;
    /** When the window resets, in epoch milliseconds. */
    resetAt: number;
  }
}

declare module '@vercube/core' {
  namespace ConfigTypes {
    // same type parameters as the declaration in core, which merging requires
    // oxlint-disable-next-line no-unused-vars
    interface Config<RuntimeUserConfig = Record<string, unknown>> {
      /**
       * Defaults for `@RateLimit()`. With both `limit` and `window` set it is
       * also an app-wide limit for every route that does not set its own.
       * Applied by `RateLimitPlugin`.
       *
       * Added by `@vercube/ratelimit`: importing the package is what puts it here.
       */
      rateLimit?: RateLimitTypes.Config;
    }
  }
}
