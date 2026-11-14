import type { MaybePromise, MiddlewareOptions } from '../../Types/CommonTypes';

/**
 * BaseMiddleware class that serves as a base for all middleware implementations.
 *
 * A middleware with an `onResponse` hook may read the request body after the
 * handler did, so the body of such a route is kept readable. A middleware that
 * never reads it can say so with `static readonly readsBody = false` on its
 * class, which spares the route that bookkeeping.
 */
export class BaseMiddleware<T = any, U = any> {
  /**
   * Middleware function that processes the HTTP event.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * Returning a Response ends the request with it. Returning a ResponseInit merges its
   * status, statusText and headers into the current response and the pipeline continues.
   *
   * @param {Request} request - The HTTP Request to process
   * @param {T[]} args - Additional arguments for the middleware.
   * @returns {MaybePromise<void | Response | ResponseInit>} - Nothing, an early Response or a ResponseInit override.
   */
  onRequest?(request: Request, response: Response, args: MiddlewareOptions<T>): MaybePromise<void | Response | ResponseInit>;

  /**
   * Middleware function that processes the response.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * Returning a Response ends the request with it. Returning a ResponseInit merges its
   * status, statusText and headers into the current response and the pipeline continues.
   *
   * @param {Request} request - The HTTP Request to process
   * @param {Response} response - The HTTP Response to process
   * @returns {MaybePromise<void | Response | ResponseInit>} - Nothing, an early Response or a ResponseInit override.
   */
  onResponse?(request: Request, response: Response, payload: U): MaybePromise<void | Response | ResponseInit>;
}
