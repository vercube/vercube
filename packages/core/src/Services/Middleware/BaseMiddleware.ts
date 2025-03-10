
import type { MaybePromise, MiddlewareOptions } from '../../Types/CommonTypes';

/**
 * BaseMiddleware class that serves as a base for all middleware implementations.
 */
export class BaseMiddleware<T = any, U = any> {

  /**
   * Middleware function that processes the HTTP event.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * WARNING: This method cannot return a value, it will be ignored.
   * Middleware can only modify the event object or throw an HttpError like BadRequestError, ForbiddenError, etc.
   *
   * @param {Request} request - The HTTP Request to process
   * @param {T[]} args - Additional arguments for the middleware.
   * @returns {void | Promise<void>} - A void or a promise that resolves when the processing is complete.
   */
  onRequest?(request: Request, args: MiddlewareOptions<T>): MaybePromise<void | Response>;

  /**
   * Middleware function that processes the response.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * WARNING: This method cannot return a value, it will be ignored.
   * Middleware can only modify the event object or throw an HttpError like BadRequestError, ForbiddenError, etc.
   *
   * @param {Request} request - The HTTP Request to process
   * @param {Response} response - The HTTP Response to process
   * @returns {void | Promise<void>} - A void or a promise that resolves when the processing is complete.
   */
  onResponse?(request: Request, response: Response, payload: U): MaybePromise<void | Response>;

}
