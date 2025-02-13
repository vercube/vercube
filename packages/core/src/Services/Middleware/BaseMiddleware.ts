/* eslint-disable @typescript-eslint/no-unused-vars */
import type { HttpEvent } from '../../Types/CommonTypes';

/**
 * BaseMiddleware class that serves as a base for all middleware implementations.
 */
export class BaseMiddleware<T = unknown> {

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
  public use(event: HttpEvent, args?: T): void | Promise<void> {}

}