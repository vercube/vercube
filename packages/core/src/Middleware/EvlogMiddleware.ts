import { InjectOptional } from '@vercube/di';
import { createMiddlewareLogger, extractSafeHeaders } from '@vercube/logger/toolkit';
import { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import { RequestContext } from '../Services/Router/RequestContext';
import type { MiddlewareOptions } from '../Types/CommonTypes';
import type { RequestLogger } from '@vercube/logger';
import type { BaseEvlogOptions, MiddlewareLoggerResult } from '@vercube/logger/toolkit';

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
 * duration - when the response is produced.
 *
 * Registered automatically by the framework; disable via `requestLogging: false`
 * in the application config.
 */
export class EvlogMiddleware extends BaseMiddleware<BaseEvlogOptions> {
  /**
   * Request context used to carry the request-scoped logger across the lifecycle.
   */
  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

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
    const url = new URL(request.url);

    const { logger, finish, skipped } = createMiddlewareLogger({
      method: request.method,
      path: url.pathname,
      requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
      headers: extractSafeHeaders(request.headers),
      ...options,
    });

    if (skipped) {
      return;
    }

    this.gRequestContext.set(EVLOG_REQUEST_LOGGER_KEY, logger);
    this.gRequestContext.set(EVLOG_FINISH_KEY, finish);
  }

  /**
   * Emits the request wide event with the final response status.
   *
   * @param _request - The HTTP request (unused)
   * @param response - The final HTTP response
   */
  public async onResponse(_request: Request, response: Response): Promise<void> {
    if (!this.gRequestContext) {
      return;
    }

    const finish = this.gRequestContext.get<MiddlewareLoggerResult['finish']>(EVLOG_FINISH_KEY);

    if (finish) {
      await finish({ status: response.status }).catch(() => {});
    }
  }
}

/**
 * Request-scoped wide-event logger type, re-exported for handler ergonomics.
 */
export type EvlogRequestLogger = RequestLogger;
