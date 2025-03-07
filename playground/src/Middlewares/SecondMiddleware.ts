import { BaseMiddleware, type HttpEvent } from '@vercube/core';
import { BadRequestError } from '@vercube/core';

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
  public async onResponse(event: HttpEvent, { body }: { body: any }): Promise<void> {
    throw new BadRequestError('Lol');
  }

}
