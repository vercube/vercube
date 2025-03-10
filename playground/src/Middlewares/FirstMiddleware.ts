 
import { BaseMiddleware } from '@vercube/core';

/**
 * FirstMiddleware class that implements the BaseMiddleware interface.
 */
export class FirstMiddleware implements BaseMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {Request} request - The incoming HTTP request.
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onRequest(): Promise<void> {
    console.log('First middleware');
  }

}
