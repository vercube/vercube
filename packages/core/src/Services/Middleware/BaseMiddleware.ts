/* eslint-disable @typescript-eslint/no-unused-vars */
import type { HttpEvent } from '../../Types/CommonTypes';

/**
 * BaseMiddleware class that serves as a base for all middleware implementations.
 */
export class BaseMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   * This method should be overridden by subclasses to implement specific middleware logic.
   * WARNING: This method cannot return a value, it will be ignored.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @returns {void | Promise<void>} - A void or a promise that resolves when the processing is complete.
   */
  public use(event: HttpEvent): void | Promise<void> {}

}