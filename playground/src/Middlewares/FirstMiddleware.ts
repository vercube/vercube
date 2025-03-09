/* eslint-disable @typescript-eslint/no-unused-vars */
import { BaseMiddleware, type HttpEvent } from '@vercube/core';

/**
 * FirstMiddleware class that implements the BaseMiddleware interface.
 */
export class FirstMiddleware implements BaseMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onRequest(request: Request): Promise<void> {
    console.log('First middleware');
  }

}
