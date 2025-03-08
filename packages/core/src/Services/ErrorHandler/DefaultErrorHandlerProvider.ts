import { H3Error, MIMES, setResponseStatus } from 'h3';
import { HttpEvent } from '@vercube/core';
import { ErrorHandlerProvider } from './ErrorHandlerProvider';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

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
    this.gLogger.error(error);

    setResponseStatus(event, error.statusCode ?? 500);
    event.node.res.setHeader('content-type', MIMES.json);
    event.node.res.end(JSON.stringify(error.message, undefined, 2));
  }
}
