import { RequestContext } from '@vercube/core';
import { InjectOptional } from '@vercube/di';
import { createMiddlewareLogger, extractSafeHeaders } from 'evlog/toolkit';
import type { EvlogTypes } from '../Types/EvlogTypes';
import type { BaseMiddleware, MiddlewareOptions } from '@vercube/core';

/**
 * Key used to store the evlog request logger in RequestContext.
 */
export const EVLOG_REQUEST_LOGGER_KEY = 'evlog:requestLogger';

/**
 * Key used to store the evlog finish function in RequestContext.
 */
export const EVLOG_FINISH_KEY = 'evlog:finish';

/**
 * Middleware that integrates evlog request-scoped logging into the vercube request lifecycle.
 *
 * On each request:
 * 1. Creates a request-scoped logger via evlog's `createMiddlewareLogger`
 * 2. Stores the logger in `RequestContext` for access via `useEvlog()`
 * 3. On response, calls `finish()` to emit the wide event through the drain pipeline
 */
export class EvlogMiddleware implements BaseMiddleware<EvlogTypes.MiddlewareOptions> {
  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  /**
   * Creates a request-scoped evlog logger and stores it in RequestContext.
   */
  public onRequest(request: Request, _response: Response, args: MiddlewareOptions<EvlogTypes.MiddlewareOptions>): void {
    if (!this.gRequestContext) {
      return;
    }

    const options = args?.middlewareArgs ?? {};
    const url = new URL(request.url);

    const { logger, finish, skipped } = createMiddlewareLogger({
      method: request.method,
      path: url.pathname,
      requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
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
   * Emits the wide event with response status.
   */
  public async onResponse(_request: Request, response: Response): Promise<void> {
    if (!this.gRequestContext) {
      return;
    }

    const finish = this.gRequestContext.get<(opts?: { status?: number; error?: Error }) => Promise<unknown>>(EVLOG_FINISH_KEY);

    if (finish) {
      await finish({ status: response.status }).catch(() => {});
    }
  }
}
