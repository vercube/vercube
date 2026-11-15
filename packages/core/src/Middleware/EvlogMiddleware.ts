import { InjectOptional } from '@vercube/di';
import { createMiddlewareLogger, extractSafeHeaders } from '@vercube/logger/toolkit';
import { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import { RequestContext } from '../Services/Router/RequestContext';
import { TelemetryRegistry } from '../Services/Telemetry/TelemetryRegistry';
import { getRequestPathname } from '../Utils/Url';
import type { MiddlewareOptions } from '../Types/CommonTypes';
import type { RequestLogger } from '@vercube/logger';
import type { BaseEvlogOptions } from '@vercube/logger/toolkit';

/**
 * Key under which the request-scoped evlog logger is stored in {@link RequestContext}.
 */
export const EVLOG_REQUEST_LOGGER_KEY = 'evlog:requestLogger';

/**
 * Key under which the evlog `finish` callback is stored in {@link RequestContext}.
 */
export const EVLOG_FINISH_KEY = 'evlog:finish';

/**
 * Global middleware that emits one structured wide event per request using
 * evlog (https://evlog.dev).
 *
 * On each request it creates a request-scoped logger via evlog's toolkit and
 * stores it in {@link RequestContext} (so handlers can enrich the event), then
 * emits the accumulated wide event - including method, path, status and
 * duration - once the response the request is answered with is known, an
 * error response and the answer to an unmatched request included.
 *
 * Registered automatically by the framework; disable via `requestLogging: false`
 * in the application config.
 */
export class EvlogMiddleware extends BaseMiddleware<BaseEvlogOptions> {
  /**
   * This middleware never reads the request body, so a route does not have to
   * keep the body readable on its account.
   */
  public static readonly readsBody = false;

  /**
   * Request context used to carry the request-scoped logger across the lifecycle.
   */
  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  /**
   * Telemetry registry, used to reuse the trace id as the request id so a wide
   * event, its spans and any downstream service all carry one identifier.
   */
  @InjectOptional(TelemetryRegistry)
  private gTelemetry!: TelemetryRegistry | null;

  /**
   * Creates a request-scoped evlog logger and stores it in the request context.
   *
   * @param request - The incoming HTTP request
   * @param _response - The current response (unused)
   * @param args - Middleware options (evlog include/exclude/drain/enrich/keep)
   */
  public onRequest(request: Request, _response: Response, args: MiddlewareOptions<BaseEvlogOptions>): void {
    if (!this.gRequestContext) {
      return;
    }

    const options = args?.middlewareArgs ?? {};

    const { logger, finish, skipped } = createMiddlewareLogger({
      method: request.method,
      path: getRequestPathname(request),
      requestId: this.resolveRequestId(request),
      headers: extractSafeHeaders(request.headers),
      ...options,
    });

    if (skipped) {
      return;
    }

    this.gRequestContext.set(EVLOG_REQUEST_LOGGER_KEY, logger);
    this.gRequestContext.set(EVLOG_FINISH_KEY, finish);

    // Not an `onResponse` hook: that one sees the intermediate response, whose
    // status is not the one a 404, a failed request or a handler answering with
    // a response of its own ends up with, and it does not run after an error.
    this.gRequestContext.onSettled((response) => finish({ status: response.status }));
  }

  /**
   * Picks the identifier the wide event is keyed by.
   *
   * With telemetry on, the trace id wins: it is shared by every service taking
   * part in the request and by every span within it, which is exactly what a
   * request id is supposed to be. Otherwise the incoming `x-request-id` is
   * honoured, and a fresh id is minted as a last resort.
   *
   * @param request - The incoming HTTP request
   * @returns The request identifier
   */
  private resolveRequestId(request: Request): string {
    return this.gTelemetry?.hooks?.traceId() ?? request.headers.get('x-request-id') ?? crypto.randomUUID();
  }
}

/**
 * Request-scoped wide-event logger type, re-exported for handler ergonomics.
 */
export type EvlogRequestLogger = RequestLogger;
