 
import { type BaseMiddleware, type MiddlewareOptions, type HttpEvent } from '@vercube/core';

/**
 * FirstMiddleware class that implements the BaseMiddleware interface.
 */
export class AuthMiddleware implements BaseMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @param {MiddlewareOptions} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async use(event: HttpEvent, args?: MiddlewareOptions): Promise<void> {
    console.log('Auth middleware', args);
  }

}