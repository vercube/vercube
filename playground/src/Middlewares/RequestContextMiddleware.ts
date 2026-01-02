import { BaseMiddleware, RequestContext } from '@vercube/core';
import { Inject } from '@vercube/di';
import type { MiddlewareOptions } from '@vercube/core';

/**
 * Middleware that extracts and stores request-specific data in the request context.
 * This middleware extracts bearer token, user ID, and sets request metadata for logging.
 */
export class RequestContextMiddleware extends BaseMiddleware {
  /** Inject the RequestContext */
  @Inject(RequestContext)
  private gRequestContext!: RequestContext;

  /**
   * Extracts bearer token and user information from the request and stores it in the context.
   *
   * @param request - The incoming HTTP request
   * @param response - The HTTP response
   * @param args - Middleware options
   */
  public async onRequest(request: Request, _response: Response, _args: MiddlewareOptions): Promise<void> {
    // Extract bearer token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      this.gRequestContext.set('bearerToken', token);

      // Extract user ID from token (simplified - in real app you'd decode JWT)
      // For demo purposes, we'll assume token format: "user-{userId}"
      const userIdMatch = token.match(/user-(\d+)/);
      if (userIdMatch) {
        this.gRequestContext.set('userId', userIdMatch[1]);
      }
    }

    // Set request metadata
    this.gRequestContext.set('requestId', crypto.randomUUID());
    this.gRequestContext.set('requestStartTime', Date.now());
    this.gRequestContext.set('requestMethod', request.method);
    this.gRequestContext.set('requestUrl', request.url);

    console.log(this.gRequestContext.getAll());
  }
}
