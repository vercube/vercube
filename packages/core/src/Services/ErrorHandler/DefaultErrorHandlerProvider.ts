import { type H3Error, MIMES, setResponseStatus } from 'h3';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import type { HttpEvent } from '../../Types/CommonTypes';
import { ErrorHandlerProvider } from './ErrorHandlerProvider';
import { InternalServerError } from '../../Errors/Http/InternalServerError';

/**
 * Default error handler provider
 *
 * @class DefaultErrorHandlerProvider
 */
export class DefaultErrorHandlerProvider extends ErrorHandlerProvider {

  @Inject(Logger)
  private gLogger!: Logger;

  /**
   * Handles errors by logging them and sending an appropriate HTTP response
   * 
   * @param error - The H3Error object containing error details
   * @param event - The HTTP event object
   * @returns void
   */
  public handleError(error: H3Error, event: HttpEvent): void {
    const _internalError = new InternalServerError();

    setResponseStatus(event, error.statusCode ?? 500);
    event.node.res.setHeader('content-type', MIMES.json);


    event.node.res.end(JSON.stringify({ ...(error?.cause ?? _internalError.cause!) }, undefined, 2));
  }
}
