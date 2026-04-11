import { RequestContext } from '@vercube/core';
import { BaseMiddleware } from '@vercube/core';
import { InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { createMiddlewareLogger, extractSafeHeaders } from 'evlog/toolkit';
import type { EvlogTypes } from '../Types/EvlogTypes';
import type { MiddlewareOptions } from '@vercube/core';

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
 * 2. Stores the logger in `RequestContext` for advanced access
 * 3. On response, merges Logger context (set via `logger.setContext()`) into the wide event and calls `finish()`
 */
export class EvlogMiddleware extends BaseMiddleware<EvlogTypes.MiddlewareOptions> {
  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /**
   * Creates a request-scoped evlog logger and stores it in RequestContext.
   */
  public override onRequest(request: Request, _response: Response, args: MiddlewareOptions<EvlogTypes.MiddlewareOptions>): void {
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
   * Merges Logger context into the wide event and emits it.
   */
  public override async onResponse(_request: Request, response: Response): Promise<void> {
    if (!this.gRequestContext) {
      return;
    }

    const requestLogger = this.gRequestContext.get<EvlogTypes.EvlogRequestLogger>(EVLOG_REQUEST_LOGGER_KEY);
    const finish = this.gRequestContext.get<(opts?: { status?: number; error?: Error }) => Promise<unknown>>(EVLOG_FINISH_KEY);

    // Merge Logger context (set via logger.setContext()) into the wide event
    if (requestLogger && this.gLogger) {
      const context = this.gLogger.getContext();
      if (Object.keys(context).length > 0) {
        requestLogger.set(context);
      }
    }

    if (finish) {
      await finish({ status: response.status }).catch(() => {});
    }
  }
}
