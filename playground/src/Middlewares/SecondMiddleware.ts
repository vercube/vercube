/* eslint-disable @typescript-eslint/no-unused-vars */
import { BaseMiddleware, type HttpEvent } from '@cube/core'

/**
 * SecondMiddleware class that implements the BaseMiddleware interface.
 */
export class SecondMiddleware implements BaseMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async use(event: HttpEvent): Promise<void> {
    console.log('Second middleware');
  }

}