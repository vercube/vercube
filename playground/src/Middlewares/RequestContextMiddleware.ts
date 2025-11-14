import { BaseMiddleware, RequestContextService } from '@vercube/core';
import { Inject } from '@vercube/di';
import type { MiddlewareOptions } from '@vercube/core';

/**
 * Middleware that extracts and stores request-specific data in the request context.
 * This middleware extracts bearer token, user ID, and sets request metadata for logging.
 */
export class RequestContextMiddleware extends BaseMiddleware {
  /** Inject the RequestContextService */
  @Inject(RequestContextService)
  private gRequestContextService!: RequestContextService;

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
      this.gRequestContextService.set('bearerToken', token);

      // Extract user ID from token (simplified - in real app you'd decode JWT)
      // For demo purposes, we'll assume token format: "user-{userId}"
      const userIdMatch = token.match(/user-(\d+)/);
      if (userIdMatch) {
        this.gRequestContextService.set('userId', userIdMatch[1]);
      }
    }

    // Set request metadata
    this.gRequestContextService.set('requestId', crypto.randomUUID());
    this.gRequestContextService.set('requestStartTime', Date.now());
    this.gRequestContextService.set('requestMethod', request.method);
    this.gRequestContextService.set('requestUrl', request.url);

    console.log(this.gRequestContextService.getAll());
  }
}
