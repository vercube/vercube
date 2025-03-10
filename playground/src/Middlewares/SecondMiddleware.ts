import { BaseMiddleware } from '@vercube/core';
import { BadRequestError } from '@vercube/core';

/**
 * SecondMiddleware class that implements the BaseMiddleware interface.
 */
export class SecondMiddleware implements BaseMiddleware {

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {Request} request - The HTTP Request to process
   * @param {Response} response - The HTTP Response to process
   * @param {unknown} body - The body of the request
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onResponse(request: Request, response: Response, body: unknown): Promise<void> {
    throw new BadRequestError('Lol');
  }

}
