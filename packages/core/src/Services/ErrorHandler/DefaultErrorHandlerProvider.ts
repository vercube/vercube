import { ErrorHandlerProvider } from './ErrorHandlerProvider';
import { InternalServerError } from '../../Errors/Http/InternalServerError';
import { HttpError } from '../../Errors/HttpError';
import { Logger } from '@vercube/logger';
import { Inject } from '@vercube/di';

/**
 * Default error handler provider
 *
 * @class DefaultErrorHandlerProvider
 */
export class DefaultErrorHandlerProvider extends ErrorHandlerProvider {

  @Inject(Logger)
  private gLogger: Logger;

  /**
   * Handles an error that occurred during request processing
   * 
   * @param error - The Error object containing error details
   * @returns Promise<Response> | Response - The response to be sent to the client
   */
  public handleError(error: Error): Response {

    const _internalError = new InternalServerError();
    const status = (error as any)?.status ?? 500;

    // check if the error is known error type and return it.
    if (error instanceof HttpError) {
      return new Response(JSON.stringify({ ...error }, undefined, 2), { status });
    }

    this.gLogger.error(error);

    return new Response(JSON.stringify({ ...(error?.cause ?? _internalError.cause!) }, undefined, 2), { status });
  }
}
