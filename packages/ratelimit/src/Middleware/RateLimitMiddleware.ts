import { BaseMiddleware, getRequestIP, RequestContext, ServiceUnavailableError, TooManyRequestsError } from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { countError, countLimited } from '../Common/Instrument';
import { RateLimitManager } from '../Services/RateLimitManager';
import type { RateLimitTypes } from '../Types/RateLimitTypes';
import type { MiddlewareOptions } from '@vercube/core';

/**
 * Counts each request against the limit of its route and answers 429 once the
 * client is over it.
 *
 * Put on routes by `@RateLimit()` and by `RateLimitPlugin` for the app-wide
 * limit. The router creates one instance per route, so the instance only keeps
 * the route's resolved options: counters live in {@link RateLimitManager}.
 */
export class RateLimitMiddleware extends BaseMiddleware<RateLimitTypes.DeclaredOptions> {
  /** Every route this middleware runs on can answer 429, the typed client and OpenAPI list it. */
  public static readonly implicitErrors = [{ error: TooManyRequestsError, module: '@vercube/core' }];

  /** Container the manager is looked up in */
  @Inject(Container)
  private gContainer!: Container;

  /** Request context handed to `key` functions */
  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  /** The route's options with the defaults applied, resolved on the first request */
  private fOptions: RateLimitTypes.ResolvedOptions | undefined;

  /** The manager, resolved on the first request */
  private fManager: RateLimitManager | undefined;

  /**
   * Counts the request and rejects it when the client is over the limit.
   *
   * @param {Request} request - The request
   * @param {Response} response - The response being built, the headers of a 429 are set on it
   * @param {MiddlewareOptions} args - The route's declaration
   * @returns {Promise<ResponseInit | void>} The `RateLimit-*` headers of an allowed request
   * @throws {TooManyRequestsError} When the client is over the limit
   * @throws {ServiceUnavailableError} When the storage fails and `onStorageError` is `deny`
   */
  public override async onRequest(
    request: Request,
    response: Response,
    args: MiddlewareOptions<RateLimitTypes.DeclaredOptions>,
  ): Promise<ResponseInit | void> {
    // a CORS preflight is answered by the browser's behalf, it never counts
    if (request.method === 'OPTIONS' && request.headers.has('access-control-request-method')) {
      return;
    }

    const manager = (this.fManager ??= this.manager());
    const options = (this.fOptions ??= manager.resolve(args.middlewareArgs ?? { name: 'global' }));
    const ip = getRequestIP(request, { trustProxy: options.trustProxy });
    const client = options.key ? await options.key({ request, ip, context: this.gRequestContext as RequestContext }) : ip;

    if (client === null || client === undefined || client === '') {
      manager.reportNoIdentity(options.name);
      return;
    }

    let result: RateLimitTypes.Result;
    const now = Date.now();

    try {
      result = await manager.consume(options, String(client), now);
    } catch (error) {
      countError(options.name);
      manager.reportStorageError(options, error);

      if (options.onStorageError === 'deny') {
        throw new ServiceUnavailableError('Rate limit storage unavailable');
      }

      return;
    }

    const reset = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
    const headers: Record<string, string> = options.headers
      ? {
          'ratelimit-limit': String(result.limit),
          'ratelimit-remaining': String(result.remaining),
          'ratelimit-reset': String(reset),
        }
      : {};

    if (!result.allowed) {
      countLimited(options.name);

      // set on the response being built: the error response keeps its headers
      for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value);
      }

      response.headers.set('retry-after', String(reset));

      throw new TooManyRequestsError('Too many requests');
    }

    return options.headers ? { headers } : undefined;
  }

  /**
   * The manager, bound on first use when `RateLimitPlugin` is not registered,
   * so `@RateLimit()` works on its own.
   * @returns {RateLimitManager} The manager
   */
  private manager(): RateLimitManager {
    const existing = this.gContainer.getOptional(RateLimitManager);

    if (existing) {
      return existing;
    }

    this.gContainer.bind(RateLimitManager);
    this.gContainer.flushQueue();

    return this.gContainer.get(RateLimitManager);
  }
}
