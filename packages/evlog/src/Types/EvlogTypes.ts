import type { EvlogProviderOptions } from '../Drivers/EvlogProvider';
import type { RequestLogger } from 'evlog';

export namespace EvlogTypes {
  /**
   * Options for the Evlog middleware.
   */
  export interface MiddlewareOptions {
    /**
     * Routes to include for request logging (glob patterns).
     * If not specified, all routes are logged.
     * @example ['/api/**']
     */
    include?: string[];

    /**
     * Routes to exclude from request logging (glob patterns).
     * Takes precedence over include.
     * @example ['/health', '/api/_evlog/**']
     */
    exclude?: string[];

    /**
     * Route-specific service name overrides.
     * First matching pattern wins - order from most specific to most general.
     * @example { '/api/auth/**': { service: 'auth-service' } }
     */
    routes?: Record<string, { service: string }>;

    /**
     * Drain callback called with every emitted event (fire-and-forget).
     */
    drain?: (ctx: DrainContext) => void | Promise<void>;

    /**
     * Enrich callback called after emit, before drain.
     * Use to add derived context (geo, user agent, etc.).
     */
    enrich?: (ctx: EnrichContext) => void | Promise<void>;

    /**
     * Tail sampling callback to force-keep logs based on request outcome.
     */
    keep?: (ctx: TailSamplingContext) => void | Promise<void>;
  }

  /**
   * Options for the Evlog plugin.
   */
  export interface PluginOptions extends MiddlewareOptions {
    /**
     * Priority for the global middleware (lower = runs earlier).
     * @default 0
     */
    priority?: number;

    /**
     * Options passed to the EvlogProvider for logger configuration.
     * Controls evlog's init behavior (pretty printing, sampling, silent mode, etc.).
     */
    provider?: EvlogProviderOptions;
  }

  /**
   * Context passed to the drain callback.
   */
  export interface DrainContext {
    event: Record<string, unknown>;
    request?: {
      method?: string;
      path?: string;
      requestId?: string;
    };
    headers?: Record<string, string>;
  }

  /**
   * Context passed to the enrich callback.
   */
  export interface EnrichContext {
    event: Record<string, unknown>;
    request?: {
      method?: string;
      path: string;
      requestId?: string;
    };
    headers?: Record<string, string>;
    response?: {
      status?: number;
      headers?: Record<string, string>;
    };
  }

  /**
   * Context passed to the tail sampling callback.
   */
  export interface TailSamplingContext {
    status?: number;
    duration?: number;
    path?: string;
    method?: string;
    context: Record<string, unknown>;
    shouldKeep?: boolean;
  }

  /**
   * Request-scoped logger interface from evlog.
   */
  export type EvlogRequestLogger = RequestLogger;
}
