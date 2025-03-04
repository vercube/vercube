import { AfterMiddleware, type HttpEvent } from '@vercube/core';

/**
 * FirstMiddleware class that implements the BaseMiddleware interface.
 */
export class FirstMiddleware implements AfterMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @param {unknown} body - The HTTP response body.
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onResponse(event: HttpEvent, body: unknown): Promise<void> {
    console.log(body);
  }

}
