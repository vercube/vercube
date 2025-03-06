
import type { HttpEvent, MiddlewareOptions } from '../../Types/CommonTypes';

/**
 * BaseMiddleware class that serves as a base for all middleware implementations.
 */
export class BaseMiddleware<T = unknown, U = unknown> {

  /**
   * Middleware function that processes the HTTP event.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * WARNING: This method cannot return a value, it will be ignored.
   * Middleware can only modify the event object or throw an HttpError like BadRequestError, ForbiddenError, etc.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @param {T[]} args - Additional arguments for the middleware.
   * @returns {void | Promise<void>} - A void or a promise that resolves when the processing is complete.
   */
  onRequest?(event: HttpEvent, args: MiddlewareOptions<T>): void | Promise<void>;

  /**
   * Middleware function that processes the response.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * WARNING: This method cannot return a value, it will be ignored.
   * Middleware can only modify the event object or throw an HttpError like BadRequestError, ForbiddenError, etc.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @param {unknown} response - The response from the controller.
   * @returns {void | Promise<void>} - A void or a promise that resolves when the processing is complete.
   */
  onResponse?(event: HttpEvent, response: { body?: U }): void | Promise<void>;

}
